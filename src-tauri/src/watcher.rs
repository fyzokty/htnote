use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, RwLock};
use std::thread;
use std::time::Duration;

use chrono::Utc;
use notify_debouncer_full::notify::{Event, EventKind, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use serde::Serialize;
use tauri::Emitter;
use uuid::Uuid;

use crate::error::AppError;
use crate::fs_util::write_file_atomic;
use crate::index::note_index::NoteIndex;
use crate::index::scan::{self, IndexedNote};
use crate::notes::html::sync_head;
use crate::notes::model::write_metadata_atomic;
use crate::notes::naming::sanitize_name;
use crate::state::AppState;

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsChangePayload {
    pub changed_note_ids: Vec<Uuid>,
    pub removed_note_ids: Vec<Uuid>,
    pub tree_changed: bool,
    pub trash_changed: bool,
}

impl FsChangePayload {
    fn is_empty(&self) -> bool {
        self.changed_note_ids.is_empty() && self.removed_note_ids.is_empty()
            && !self.tree_changed && !self.trash_changed
    }
}

#[derive(Default, Debug)]
struct Affected {
    content_note_dirs: HashSet<PathBuf>,
    structural: bool,
    trash_changed: bool,
    needs_full_scan: bool,
}

// Bilinen not kökleri girdi olarak verilir; olay sınıflaması dosya sistemini okumaz.
fn classify_events(root: &Path, events: &[Event], known: &HashSet<PathBuf>) -> Affected {
    let mut affected = Affected::default();
    for event in events {
        if matches!(event.kind, EventKind::Other) || event.need_rescan() {
            affected.needs_full_scan = true;
        }
        if matches!(event.kind, EventKind::Modify(notify_debouncer_full::notify::event::ModifyKind::Name(_))) {
            affected.structural = true;
        }
        for path in &event.paths {
            let Ok(relative) = path.strip_prefix(root) else { continue };
            let parts: Vec<_> = relative.components().collect();
            if parts.is_empty() { affected.needs_full_scan = true; continue; }
            if parts[0].as_os_str() == ".trash" {
                affected.trash_changed = true;
                continue;
            }
            if parts.iter().any(|part| part.as_os_str().to_string_lossy().starts_with('.')) {
                continue;
            }
            let note_dir = known.iter().filter(|dir| path.starts_with(dir.as_path()))
                .max_by_key(|dir| dir.components().count());
            if let Some(dir) = note_dir {
                if matches!(event.kind, EventKind::Create(notify_debouncer_full::notify::event::CreateKind::Folder)
                    | EventKind::Remove(notify_debouncer_full::notify::event::RemoveKind::Folder)) {
                    affected.structural = true;
                } else {
                    affected.content_note_dirs.insert(dir.clone());
                }
            } else {
                affected.structural = true;
            }
        }
    }
    affected
}

fn sync_title_from_folder(root: &Path, note: &mut IndexedNote) -> Result<bool, AppError> {
    let dir = root.join(&note.rel_path);
    let name = dir.file_name().unwrap_or_default().to_string_lossy();
    if sanitize_name(&note.metadata.title) == name { return Ok(false); }
    let mut metadata = note.metadata.clone();
    metadata.title = name.into_owned();
    metadata.updated_at = Utc::now();
    let html_path = dir.join("index.html");
    let html = std::fs::read_to_string(&html_path)?;
    let updated = sync_head(&html, &metadata, dir.join("style.css").is_file(), dir.join("script.js").is_file());
    write_metadata_atomic(&dir.join("metadata.json"), &metadata)?;
    if updated != html { write_file_atomic(&html_path, updated.as_bytes())?; }
    note.metadata = metadata;
    Ok(true)
}

fn apply_batch(root: &Path, index: &RwLock<NoteIndex>, affected: Affected) -> Result<FsChangePayload, AppError> {
    let mut payload = FsChangePayload { trash_changed: affected.trash_changed, ..Default::default() };
    if affected.structural || affected.needs_full_scan {
        let previous = index.read().map_err(|error| AppError::Internal(error.to_string()))?
            .by_id.clone();
        // Kopya alfabetik olarak önce gelirse eski yoldaki UUID korunur.
        let preview = scan::scan_readonly(root)?;
        for (id, old) in &previous {
            if preview.notes.iter().any(|note| note.rel_path == old.rel_path && note.metadata.id != *id) {
                if let Some(copy) = preview.notes.iter().find(|note| note.metadata.id == *id && note.rel_path != old.rel_path) {
                    let mut metadata = copy.metadata.clone();
                    metadata.id = Uuid::new_v4();
                    write_metadata_atomic(&root.join(&copy.rel_path).join("metadata.json"), &metadata)?;
                }
            }
        }
        // T203 onarımları tarama sırasında ve indeks kilidi dışında yapılır.
        let mut result = scan::scan(root)?;
        let prior_paths: HashMap<_, _> = previous.iter().map(|(id, note)| (*id, note.rel_path.clone())).collect();
        for note in &mut result.notes {
            if let Some(old_path) = prior_paths.get(&note.metadata.id) {
                if old_path != &note.rel_path && sync_title_from_folder(root, note)? {
                    // Aşağıda yeni metadata ile ağaç yeniden oluşturulur.
                }
            }
        }
        // Başlık eşitlemesi scan ağacındaki başlıkları da günceller.
        if result.notes.iter().any(|note| previous.get(&note.metadata.id)
            .is_some_and(|old| old.rel_path != note.rel_path && old.metadata.title != note.metadata.title)) {
            result = scan::scan_readonly(root)?;
        }
        let current: HashMap<_, _> = result.notes.iter().map(|note| (note.metadata.id, note)).collect();
        for (id, old) in &previous {
            if !current.contains_key(id) { payload.removed_note_ids.push(*id); }
            else if current[id].rel_path != old.rel_path || current[id].metadata.updated_at != old.metadata.updated_at
                || current[id].metadata.title != old.metadata.title {
                payload.changed_note_ids.push(*id);
            }
        }
        for id in current.keys() {
            if !previous.contains_key(id) { payload.changed_note_ids.push(*id); }
        }
        let old_tree = serde_json::to_value(&index.read().map_err(|error| AppError::Internal(error.to_string()))?.tree)?;
        payload.tree_changed = old_tree != serde_json::to_value(&result.tree)?;
        index.write().map_err(|error| AppError::Internal(error.to_string()))?.replace_all(result);
    } else {
        for dir in affected.content_note_dirs {
            let relative = crate::index::rel_string(dir.strip_prefix(root)
                .map_err(|error| AppError::Internal(error.to_string()))?);
            let id = index.read().map_err(|error| AppError::Internal(error.to_string()))?
                .by_id.iter().find(|(_, note)| note.rel_path == relative).map(|(id, _)| *id);
            if let Some(id) = id {
                let metadata = crate::notes::model::read_metadata(&dir.join("metadata.json"))?;
                if metadata.id != id {
                    return apply_batch(root, index, Affected { needs_full_scan: true, ..Default::default() });
                }
                let mut locked = index.write().map_err(|error| AppError::Internal(error.to_string()))?;
                let old_tree = serde_json::to_value(&locked.tree)?;
                locked.upsert(IndexedNote { rel_path: relative, metadata });
                payload.tree_changed |= old_tree != serde_json::to_value(&locked.tree)?;
                payload.changed_note_ids.push(id);
            }
        }
    }
    payload.changed_note_ids.sort_unstable();
    payload.changed_note_ids.dedup();
    payload.removed_note_ids.sort_unstable();
    Ok(payload)
}

enum Message { Events(DebounceEventResult), Stop }

pub struct WatcherManager {
    sender: mpsc::Sender<Message>,
    worker: Option<thread::JoinHandle<()>>,
}

impl WatcherManager {
    fn start(root: PathBuf, index: Arc<RwLock<NoteIndex>>,
        emit: impl Fn(FsChangePayload) + Send + 'static) -> Self {
        let (sender, receiver) = mpsc::channel();
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        let callback = sender.clone();
        let worker = thread::spawn(move || {
            let mut retries = 0;
            let mut ready_sender = Some(ready_sender);
            loop {
                let callback = callback.clone();
                let started = new_debouncer(Duration::from_millis(250), None,
                    move |events| { let _ = callback.send(Message::Events(events)); });
                match started {
                    Ok(mut debouncer) => {
                        if let Err(error) = debouncer.watch(&root, RecursiveMode::Recursive) {
                            eprintln!("File watcher error: {error}");
                        } else {
                            if let Some(ready) = ready_sender.take() { let _ = ready.send(()); }
                            retries = 0;
                            loop {
                                match receiver.recv() {
                                    Ok(Message::Stop) | Err(_) => return,
                                    Ok(Message::Events(Ok(events))) => {
                                        let events: Vec<_> = events.into_iter().map(|item| item.event).collect();
                                        let handled = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                            let known: HashSet<_> = index.read().map_err(|error| AppError::Internal(error.to_string()))?
                                                .by_id.values().map(|note| root.join(&note.rel_path)).collect();
                                            let affected = classify_events(&root, &events, &known);
                                            let payload = apply_batch(&root, &index, affected)?;
                                            if !payload.is_empty() { emit(payload); }
                                            Ok::<(), AppError>(())
                                        }));
                                        match handled {
                                            Ok(Ok(())) => (),
                                            Ok(Err(error)) => {
                                                eprintln!("File watcher batch failed: {error}");
                                                thread::sleep(Duration::from_millis(100));
                                                if let Ok(payload) = apply_batch(&root, &index,
                                                    Affected { needs_full_scan: true, ..Default::default() }) {
                                                    if !payload.is_empty() { emit(payload); }
                                                }
                                            }
                                            Err(_) => eprintln!("File watcher batch panicked"),
                                        }
                                    }
                                    Ok(Message::Events(Err(errors))) => {
                                        eprintln!("File watcher errors: {errors:?}");
                                        if let Ok(payload) = apply_batch(&root, &index,
                                            Affected { needs_full_scan: true, ..Default::default() }) {
                                            if !payload.is_empty() { emit(payload); }
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    Err(error) => eprintln!("File watcher startup failed: {error}"),
                }
                retries += 1;
                if retries >= 5 { eprintln!("File watcher restart limit reached"); return; }
                // Hata sonrası bekleme bloklayıcıdır; Stop mesajı beklemeyi keser.
                match receiver.recv_timeout(Duration::from_secs(2)) {
                    Ok(Message::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => return,
                    _ => (),
                }
            }
        });
        let _ = ready_receiver.recv_timeout(Duration::from_secs(1));
        Self { sender, worker: Some(worker) }
    }
}

impl Drop for WatcherManager {
    fn drop(&mut self) {
        let _ = self.sender.send(Message::Stop);
        if let Some(worker) = self.worker.take() { let _ = worker.join(); }
    }
}

pub fn start_for_app(state: &AppState, app: tauri::AppHandle) -> Result<(), AppError> {
    let root = state.root_dir.read().map_err(|error| AppError::Internal(error.to_string()))?.clone();
    let index = Arc::clone(&state.note_index);
    let search_index = Arc::clone(&state.search_index);
    let link_index = Arc::clone(&state.link_index);
    let note_index = Arc::clone(&state.note_index);
    let manager = WatcherManager::start(root, index, move |payload| {
        if let Err(error) = crate::search::reindex_notes(&note_index, &search_index, &link_index,
            &payload.changed_note_ids, &payload.removed_note_ids) {
            eprintln!("Search index update failed: {error}");
        }
        if let Err(error) = app.emit("fs-change", payload) {
            eprintln!("File watcher emit failed: {error}");
        }
    });
    *state.watcher.lock().map_err(|error| AppError::Internal(error.to_string()))? = Some(manager);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::create::create_note_in;
    use notify_debouncer_full::notify::event::{CreateKind, ModifyKind, RemoveKind, RenameMode};
    use std::fs;
    use std::time::Instant;

    fn event(kind: EventKind, paths: Vec<PathBuf>) -> Event {
        Event { kind, paths, attrs: Default::default() }
    }

    fn structural() -> Affected { Affected { structural: true, ..Default::default() } }

    #[test]
    fn classifies_paths_and_rename_pairs() {
        let root = Path::new("root");
        let known = HashSet::from([root.join("group/note")]);
        for file in ["index.html", "style.css", "script.js", "metadata.json"] {
            let affected = classify_events(root, &[event(EventKind::Modify(ModifyKind::Any), vec![root.join("group/note").join(file)])], &known);
            assert_eq!(affected.content_note_dirs, known);
            assert!(!affected.structural);
        }
        let cases = [
            (vec![root.join("group/new"), root.join("group")], false, true),
            (vec![root.join(".trash/old")], true, false),
            (vec![root.join(".hidden/file")], false, false),
        ];
        for (paths, trash, structure) in cases {
            let affected = classify_events(root, &[event(EventKind::Create(CreateKind::Folder), paths)], &known);
            assert_eq!(affected.trash_changed, trash);
            assert_eq!(affected.structural, structure);
        }
        let renamed = classify_events(root, &[event(EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            vec![root.join("group/note"), root.join("group/renamed")])], &known);
        assert!(renamed.structural);
        assert!(classify_events(root, &[event(EventKind::Other, vec![])], &known).needs_full_scan);
        assert!(classify_events(root, &[event(EventKind::Remove(RemoveKind::Folder), vec![root.join("group/note")])], &known).structural);
    }

    #[test]
    fn applies_changes_and_syncs_external_rename_once() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let (_, original) = create_note_in(root, "", Some("Zeta")).unwrap();
        let id = original.metadata.id;
        let index = RwLock::new(NoteIndex::new(root.to_path_buf()));
        let first = apply_batch(root, &index, structural()).unwrap();
        assert_eq!(first.changed_note_ids, vec![id]);
        assert!(first.tree_changed);
        fs::write(root.join("Zeta/style.css"), "body {}").unwrap();
        let changed = apply_batch(root, &index, Affected { content_note_dirs: HashSet::from([root.join("Zeta")]), ..Default::default() }).unwrap();
        assert_eq!(changed.changed_note_ids, vec![id]);
        assert!(!changed.tree_changed);
        fs::rename(root.join("Zeta"), root.join("Renamed")).unwrap();
        let renamed = apply_batch(root, &index, structural()).unwrap();
        assert_eq!(renamed.changed_note_ids, vec![id]);
        assert!(renamed.tree_changed);
        assert_eq!(index.read().unwrap().by_id[&id].metadata.title, "Renamed");
        assert!(fs::read_to_string(root.join("Renamed/index.html")).unwrap().contains("<title>Renamed</title>"));
        let bytes = fs::read(root.join("Renamed/metadata.json")).unwrap();
        let second = apply_batch(root, &index, structural()).unwrap();
        assert!(second.is_empty());
        assert_eq!(bytes, fs::read(root.join("Renamed/metadata.json")).unwrap());
        fs::remove_dir_all(root.join("Renamed")).unwrap();
        let removed = apply_batch(root, &index, structural()).unwrap();
        assert_eq!(removed.removed_note_ids, vec![id]);
        assert!(removed.tree_changed);
        let trash = apply_batch(root, &index, Affected { trash_changed: true, ..Default::default() }).unwrap();
        assert!(trash.trash_changed);
    }

    #[test]
    fn watcher_payload_updates_search_index() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let (_, note) = create_note_in(root, "", Some("Searchable")).unwrap();
        let index = RwLock::new(NoteIndex::new(root.to_path_buf()));
        let search = RwLock::new(crate::search::SearchIndex::default());
        let links = RwLock::new(crate::links::LinkIndex::default());
        let added = apply_batch(root, &index, structural()).unwrap();
        crate::search::reindex_notes(&index, &search, &links, &added.changed_note_ids, &added.removed_note_ids).unwrap();
        assert_eq!(search.read().unwrap().search("Searchable", 10)[0].id, note.metadata.id);
        let target = uuid::Uuid::new_v4();
        fs::write(root.join("Searchable/index.html"), format!("<main>İstanbul <a href='htnote://note/{target}'>link</a></main>")).unwrap();
        let changed = apply_batch(root, &index, Affected { content_note_dirs: HashSet::from([root.join("Searchable")]), ..Default::default() }).unwrap();
        crate::search::reindex_notes(&index, &search, &links, &changed.changed_note_ids, &changed.removed_note_ids).unwrap();
        assert_eq!(search.read().unwrap().search("istanbul", 10).len(), 1);
        assert_eq!(links.read().unwrap().backlinks(target).len(), 1);
        fs::remove_dir_all(root.join("Searchable")).unwrap();
        let removed = apply_batch(root, &index, structural()).unwrap();
        crate::search::reindex_notes(&index, &search, &links, &removed.changed_note_ids, &removed.removed_note_ids).unwrap();
        assert!(search.read().unwrap().search("istanbul", 10).is_empty());
        assert!(links.read().unwrap().backlinks(target).is_empty());
    }

    #[test]
    fn copy_keeps_original_id_even_when_copy_sorts_first() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let (_, original) = create_note_in(root, "", Some("Zeta")).unwrap();
        let index = RwLock::new(NoteIndex::new(root.to_path_buf()));
        apply_batch(root, &index, structural()).unwrap();
        fs::create_dir(root.join("Alpha")).unwrap();
        for file in ["metadata.json", "index.html"] {
            fs::copy(root.join("Zeta").join(file), root.join("Alpha").join(file)).unwrap();
        }
        let payload = apply_batch(root, &index, structural()).unwrap();
        let locked = index.read().unwrap();
        assert_eq!(locked.rel_path(original.metadata.id), Some("Zeta"));
        assert_eq!(locked.by_id.len(), 2);
        assert_eq!(payload.changed_note_ids.len(), 1);
    }

    #[test]
    fn payload_reports_changes_removals_flags_and_camel_case() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let (_, removed_note) = create_note_in(root, "", Some("Removed")).unwrap();
        let index = RwLock::new(NoteIndex::new(root.to_path_buf()));
        apply_batch(root, &index, structural()).unwrap();

        let empty = apply_batch(root, &index, Affected::default()).unwrap();
        assert!(empty.is_empty());

        fs::remove_dir_all(root.join("Removed")).unwrap();
        let (_, added_note) = create_note_in(root, "", Some("Added")).unwrap();
        let payload = apply_batch(root, &index, Affected {
            structural: true,
            trash_changed: true,
            ..Default::default()
        }).unwrap();
        assert_eq!(payload.changed_note_ids, vec![added_note.metadata.id]);
        assert_eq!(payload.removed_note_ids, vec![removed_note.metadata.id]);
        assert!(payload.tree_changed);
        assert!(payload.trash_changed);
        assert!(!payload.is_empty());
        assert_eq!(serde_json::to_value(&payload).unwrap(), serde_json::json!({
            "changedNoteIds": [added_note.metadata.id],
            "removedNoteIds": [removed_note.metadata.id],
            "treeChanged": true,
            "trashChanged": true,
        }));
    }

    #[test]
    fn replacing_watcher_observes_only_new_root() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let index = Arc::new(RwLock::new(NoteIndex::new(first.path().to_path_buf())));
        let (sender, receiver) = mpsc::channel();
        let old_sender = sender.clone();
        let mut watcher = Some(WatcherManager::start(first.path().to_path_buf(), Arc::clone(&index),
            move |payload| { let _ = old_sender.send(payload); }));

        // Ayar değişikliğindeki sıra: eski izleyiciyi durdur, indeksi değiştir, yenisini başlat.
        drop(watcher.take());
        {
            let mut locked = index.write().unwrap();
            locked.root = second.path().to_path_buf();
            locked.replace_all(scan::scan(second.path()).unwrap());
        }
        watcher = Some(WatcherManager::start(second.path().to_path_buf(), Arc::clone(&index),
            move |payload| { let _ = sender.send(payload); }));

        let (_, old_note) = create_note_in(first.path(), "", Some("Old")).unwrap();
        assert!(receiver.recv_timeout(Duration::from_millis(600)).is_err());
        assert!(index.read().unwrap().resolve(old_note.metadata.id).is_none());

        let (_, new_note) = create_note_in(second.path(), "", Some("New")).unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        let payload = loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            let event = receiver.recv_timeout(remaining).expect("new root event timeout");
            if event.changed_note_ids.contains(&new_note.metadata.id) { break event; }
        };
        assert!(payload.tree_changed);
        assert_eq!(index.read().unwrap().rel_path(new_note.metadata.id), Some("New"));
        assert!(index.read().unwrap().resolve(old_note.metadata.id).is_none());
        drop(watcher);
    }

    #[test]
    fn watcher_observes_file_operations() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().to_path_buf();
        let index = Arc::new(RwLock::new(NoteIndex::new(root.clone())));
        let (sender, receiver) = mpsc::channel();
        let watcher = WatcherManager::start(root.clone(), Arc::clone(&index), move |payload| { let _ = sender.send(payload); });
        let (_, note) = create_note_in(&root, "", Some("Original")).unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        let wait_for = |check: &dyn Fn(&NoteIndex) -> bool| {
            while Instant::now() < deadline {
                if check(&index.read().unwrap()) { return; }
                let _ = receiver.recv_timeout(Duration::from_millis(50));
            }
            panic!("watcher index timeout");
        };
        let wait_for_payload = |check: &dyn Fn(&FsChangePayload) -> bool| {
            while Instant::now() < deadline {
                if let Ok(payload) = receiver.recv_timeout(Duration::from_millis(50)) {
                    if check(&payload) { return payload; }
                }
            }
            panic!("watcher payload timeout");
        };
        let created = wait_for_payload(&|payload| payload.changed_note_ids.contains(&note.metadata.id));
        assert!(created.tree_changed);
        wait_for(&|index| index.rel_path(note.metadata.id) == Some("Original"));
        fs::create_dir(root.join("Group")).unwrap();
        wait_for(&|index| index.tree.iter().any(|node| matches!(node,
            crate::index::scan::TreeNode::Folder { rel_path, .. } if rel_path == "Group")));
        fs::create_dir(root.join("Copy")).unwrap();
        for file in ["metadata.json", "index.html"] {
            fs::copy(root.join("Original").join(file), root.join("Copy").join(file)).unwrap();
        }
        wait_for(&|index| index.by_id.len() == 2 && index.rel_path(note.metadata.id) == Some("Original"));
        let copy_id = index.read().unwrap().by_id.iter().find(|(_, item)| item.rel_path == "Copy").unwrap().0.to_owned();
        fs::rename(root.join("Original"), root.join("External")).unwrap();
        let renamed = wait_for_payload(&|payload| payload.changed_note_ids.contains(&note.metadata.id)
            && index.read().unwrap().rel_path(note.metadata.id) == Some("External"));
        assert!(renamed.tree_changed);
        wait_for(&|index| index.rel_path(note.metadata.id) == Some("External"));
        fs::remove_dir_all(root.join("Copy")).unwrap();
        wait_for(&|index| index.rel_path(copy_id).is_none());
        fs::remove_dir_all(root.join("External")).unwrap();
        let removed = wait_for_payload(&|payload| payload.removed_note_ids.contains(&note.metadata.id));
        assert!(removed.tree_changed);
        wait_for(&|index| index.rel_path(note.metadata.id).is_none());
        drop(watcher);
    }

    #[test]
    fn bulk_file_copy_is_debounced() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().to_path_buf();
        let (_, note) = create_note_in(&root, "", Some("Bulk")).unwrap();
        let mut initial = NoteIndex::new(root.clone());
        initial.replace_all(scan::scan(&root).unwrap());
        let index = Arc::new(RwLock::new(initial));
        let (sender, receiver) = mpsc::channel();
        let watcher = WatcherManager::start(root.clone(), index, move |payload| { let _ = sender.send(payload); });
        let assets = root.join("Bulk/assets");
        fs::create_dir_all(&assets).unwrap();
        for number in 0..200 {
            fs::write(assets.join(format!("{number}.txt")), b"copy").unwrap();
        }
        let mut count = 0;
        let deadline = Instant::now() + Duration::from_secs(15);
        while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
            match receiver.recv_timeout(remaining.min(Duration::from_secs(2))) {
                Ok(payload) if payload.changed_note_ids.contains(&note.metadata.id) => count += 1,
                Ok(_) => (),
                Err(mpsc::RecvTimeoutError::Timeout) => break,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        // Yavaş CI koşucusunda birkaç parti daha oluşabilir; yine de 200 dosya az sayıda olaya birleşmeli.
        assert!((1..=20).contains(&count), "{count} fs-change events for 200 files");
        drop(watcher);
    }
}
