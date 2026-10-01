mod extract;
mod normalize;

use std::collections::{HashMap, HashSet};
use std::sync::atomic::Ordering;
use std::sync::{Arc, RwLock};

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::index::note_index::NoteIndex;
use crate::index::scan::IndexedNote;
use crate::state::AppState;

use self::extract::extract_text;
use self::normalize::{tr_fold, Folded};

pub struct Entry {
    title: String,
    tags: Vec<String>,
    text: String,
    text_norm: Folded,
    title_norm: String,
    rel_path: String,
    updated_at: DateTime<Utc>,
}

#[derive(Default)]
pub struct SearchIndex {
    entries: HashMap<Uuid, Entry>,
    versions: HashMap<Uuid, u64>,
    generation: u64,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchSnippet {
    pub before: String,
    pub r#match: String,
    pub after: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: Uuid,
    pub title: String,
    pub rel_path: String,
    pub title_match: bool,
    pub match_count: usize,
    pub snippets: Vec<SearchSnippet>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchNotesResult {
    pub results: Vec<SearchResult>,
    pub indexing: bool,
}

fn occurrences(text: &str, term: &str) -> Vec<usize> {
    text.match_indices(term).map(|(offset, _)| text[..offset].chars().count()).collect()
}

fn snippet(text: &str, map: &[(usize, usize)], position: usize, length: usize) -> Option<SearchSnippet> {
    let chars: Vec<char> = text.chars().collect();
    let start = map.get(position)?.0;
    let end = map.get(position.checked_add(length)?.checked_sub(1)?)?.1.min(chars.len());
    let mut left = start.saturating_sub(60);
    let mut right = end.saturating_add(60).min(chars.len());
    while left > 0 && !chars[left - 1].is_whitespace() { left -= 1; }
    while right < chars.len() && !chars[right].is_whitespace() { right += 1; }
    Some(SearchSnippet {
        before: chars[left..start].iter().collect(),
        r#match: chars[start..end].iter().collect(),
        after: chars[end..right].iter().collect(),
    })
}

impl SearchIndex {
    pub fn upsert(&mut self, note: &IndexedNote, html: &str) {
        let text = extract_text(html);
        self.entries.insert(note.metadata.id, Entry {
            title: note.metadata.title.clone(),
            tags: note.metadata.tags.clone(),
            text_norm: tr_fold(&text),
            title_norm: tr_fold(&note.metadata.title).text,
            text,
            rel_path: note.rel_path.clone(),
            updated_at: note.metadata.updated_at,
        });
    }

    pub fn remove(&mut self, id: Uuid) { self.entries.remove(&id); }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.versions.clear();
        self.generation = self.generation.wrapping_add(1);
    }

    fn upsert_initial(&mut self, note: &IndexedNote, html: &str, generation: u64, version: u64) {
        if self.generation == generation
            && self.versions.get(&note.metadata.id).copied().unwrap_or_default() == version {
            self.upsert(note, html);
        }
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<SearchResult> {
        let query = tr_fold(query.trim()).text;
        let words: Vec<_> = query.split_whitespace().collect();
        if words.iter().any(|word| word.chars().count() < 2) { return Vec::new(); }
        let Some(first) = words.first() else { return Vec::new() };
        let mut matches: Vec<_> = self.entries.iter().filter_map(|(id, entry)| {
            let tags = entry.tags.iter().map(|tag| tr_fold(tag).text).collect::<Vec<_>>();
            let title_match = words.iter().any(|word| entry.title_norm.contains(word));
            let tag_match = words.iter().any(|word| tags.iter().any(|tag| tag.contains(word)));
            if !words.iter().all(|word| entry.title_norm.contains(word)
                || tags.iter().any(|tag| tag.contains(word)) || entry.text_norm.text.contains(word)) { return None; }
            let count = words.iter().map(|word| occurrences(&entry.text_norm.text, word).len()).sum();
            let mut seen = HashSet::new();
            let snippets = occurrences(&entry.text_norm.text, first).into_iter()
                .filter(|position| {
                    let end = position + first.chars().count() - 1;
                    match (entry.text_norm.map.get(*position), entry.text_norm.map.get(end)) {
                        (Some(start), Some(end)) => seen.insert((start.0, end.1)),
                        _ => false,
                    }
                })
                .filter_map(|position| snippet(&entry.text, &entry.text_norm.map, position, first.chars().count()))
                .take(3).collect();
            Some((title_match, tag_match, entry.updated_at, SearchResult {
                id: *id, title: entry.title.clone(), rel_path: entry.rel_path.clone(),
                title_match, match_count: count, snippets,
            }))
        }).collect();
        matches.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1))
            .then_with(|| b.3.match_count.cmp(&a.3.match_count))
            .then_with(|| b.2.cmp(&a.2)).then_with(|| a.3.id.cmp(&b.3.id)));
        matches.into_iter().take(limit).map(|item| item.3).collect()
    }
}

// Not indeksi kilidi bırakılmadan arama indeksi kilidi alınmaz.
pub fn reindex_notes(index: &RwLock<NoteIndex>, search: &RwLock<SearchIndex>, ids: &[Uuid], removed: &[Uuid]) -> Result<(), AppError> {
    // Dosya okuma sürerken başlayan daha yeni bir güncelleme eski sonucu geçersiz kılar.
    let (generation, versions) = {
        let mut search = search.write().map_err(|error| AppError::Internal(error.to_string()))?;
        for id in ids.iter().chain(removed) {
            let version = search.versions.entry(*id).or_default();
            *version = version.wrapping_add(1);
        }
        (search.generation, ids.iter().chain(removed).map(|id| (*id, search.versions[id])).collect::<HashMap<_, _>>())
    };
    let notes = {
        let index = index.read().map_err(|error| AppError::Internal(error.to_string()))?;
        ids.iter().filter_map(|id| index.by_id.get(id).and_then(|note| index.resolve(*id).map(|dir| (note.clone(), dir)))).collect::<Vec<_>>()
    };
    let loaded = notes.into_iter().map(|(note, dir)| {
        let html = match std::fs::read_to_string(dir.join("index.html")) {
            Ok(html) => html,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(error) => return Err(error.into()),
        };
        Ok::<_, AppError>((note, html))
    }).collect::<Result<Vec<_>, _>>()?;
    let mut search = search.write().map_err(|error| AppError::Internal(error.to_string()))?;
    if search.generation != generation { return Ok(()); }
    for id in removed {
        if search.versions.get(id) == versions.get(id) { search.remove(*id); }
    }
    for (note, html) in loaded {
        let id = note.metadata.id;
        if search.versions.get(&id) == versions.get(&id) { search.upsert(&note, &html); }
    }
    Ok(())
}

fn index_initial_note(index: &RwLock<NoteIndex>, search: &RwLock<SearchIndex>, id: Uuid, generation: u64) -> Result<(), AppError> {
    let version = {
        let search = search.read().map_err(|error| AppError::Internal(error.to_string()))?;
        if search.generation != generation { return Ok(()); }
        search.versions.get(&id).copied().unwrap_or_default()
    };
    let note = {
        let index = index.read().map_err(|error| AppError::Internal(error.to_string()))?;
        index.by_id.get(&id).and_then(|note| index.resolve(id).map(|dir| (note.clone(), dir)))
    };
    let Some((note, dir)) = note else { return Ok(()); };
    let html = match std::fs::read_to_string(dir.join("index.html")) {
        Ok(html) => html,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.into()),
    };
    let mut search = search.write().map_err(|error| AppError::Internal(error.to_string()))?;
    search.upsert_initial(&note, &html, generation, version);
    Ok(())
}

pub fn start_build(state: &AppState) {
    let generation = match state.search_index.write() {
        Ok(mut search) => {
            search.clear();
            state.search_indexing.store(true, Ordering::Release);
            search.generation
        }
        Err(error) => {
            eprintln!("Search indexing failed: {error}");
            return;
        }
    };
    let index = Arc::clone(&state.note_index);
    let search = Arc::clone(&state.search_index);
    let indexing = Arc::clone(&state.search_indexing);
    std::thread::spawn(move || {
        let ids = index.read().map(|locked| locked.by_id.keys().copied().collect::<Vec<_>>()).unwrap_or_default();
        for id in ids {
            if let Err(error) = index_initial_note(&index, &search, id, generation) {
                eprintln!("Search indexing failed: {error}");
            }
        }
        if let Ok(locked) = search.read() {
            if locked.generation == generation { indexing.store(false, Ordering::Release); }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::note_index::NoteIndex;
    use crate::notes::model::NoteMetadata;

    fn add(index: &mut SearchIndex, title: &str, tags: &[&str], html: &str) -> Uuid {
        let mut metadata = NoteMetadata::new(title);
        metadata.tags = tags.iter().map(|tag| (*tag).into()).collect();
        let id = metadata.id;
        index.upsert(&IndexedNote { rel_path: title.into(), metadata }, html);
        id
    }

    #[test]
    fn ranks_and_filters_and_limits() {
        let mut index = SearchIndex::default();
        let content = add(&mut index, "Other", &[], "<p>İSTANBUL güzel İstanbul</p>");
        let tag = add(&mut index, "Second", &["istanbul"], "<p>güzel</p>");
        let title = add(&mut index, "İstanbul", &[], "<p>güzel</p>");
        assert_eq!(index.search("istanbul", 3).iter().map(|item| item.id).collect::<Vec<_>>(), vec![title, tag, content]);
        assert_eq!(index.search("istanbul güzel", 3).len(), 3);
        assert!(index.search("istanbul yok", 3).is_empty());
        assert_eq!(index.search("istanbul", 1).len(), 1);
        assert!(index.search("i", 3).is_empty());
        assert!(index.search("a b", 3).is_empty());
        assert_eq!(index.search("ılık", 3).len(), 0);
        add(&mut index, "Warm", &[], "<p>ILIK</p>");
        assert_eq!(index.search("ılık", 3).len(), 1);
        let many = add(&mut index, "Third", &[], "<p>istanbul istanbul istanbul</p>");
        let ranked = index.search("istanbul", 10);
        assert_eq!(ranked.iter().position(|item| item.id == many).unwrap() + 1,
            ranked.iter().position(|item| item.id == content).unwrap());
    }

    #[test]
    fn snippets_preserve_unicode_without_panics() {
        let mut index = SearchIndex::default();
        add(&mut index, "X", &[], "<p>😀 İSTANBUL éé</p>");
        let result = index.search("istanbul", 5);
        assert_eq!(result[0].snippets[0].r#match, "İSTANBUL");
        assert_eq!(result[0].snippets[0].before, "😀 ");
        let expansion_map = [(0, 1), (0, 1), (1, 2)];
        assert_eq!(snippet("İx", &expansion_map, 1, 2).unwrap().r#match, "İx");
        let long = format!("{} hedef {}", "ön ".repeat(30), "son ".repeat(30));
        add(&mut index, "Y", &[], &format!("<p>{long}hedef hedef hedef</p>"));
        let snippets = index.search("hedef", 10).into_iter().find(|item| item.title == "Y").unwrap().snippets;
        assert_eq!(snippets.len(), 3);
        assert!(snippets[0].before.starts_with("ön "));
        assert!(snippets[0].after.ends_with("son"));
        for seed in 0..200 {
            let text: String = (0..80).map(|n| ['İ', '😀', 'ı', '\u{307}', 'a', ' '][(seed + n) % 6]).collect();
            let mut index = SearchIndex::default();
            add(&mut index, "X", &[], &format!("<p>{text}</p>"));
            let _ = index.search("i😀", 10);
        }
    }

    #[test]
    fn startup_result_cannot_replace_a_newer_update() {
        let temp = tempfile::tempdir().unwrap();
        let mut metadata = NoteMetadata::new("Current");
        let id = metadata.id;
        let dir = temp.path().join("Current");
        std::fs::create_dir(&dir).unwrap();
        std::fs::write(dir.join("index.html"), "<p>new content</p>").unwrap();
        metadata.tags = Vec::new();
        let note = IndexedNote { rel_path: "Current".into(), metadata };
        let mut notes = NoteIndex::new(temp.path().to_path_buf());
        notes.upsert(note.clone());
        let notes = RwLock::new(notes);
        let search = RwLock::new(SearchIndex::default());
        reindex_notes(&notes, &search, &[id], &[]).unwrap();
        search.write().unwrap().upsert_initial(&note, "<p>stale content</p>", 0, 0);
        assert_eq!(search.read().unwrap().search("new content", 10).len(), 1);
        assert!(search.read().unwrap().search("stale content", 10).is_empty());
        search.write().unwrap().clear();
        search.write().unwrap().upsert_initial(&note, "<p>stale content</p>", 0, 1);
        assert!(search.read().unwrap().search("stale content", 10).is_empty());
    }
}
