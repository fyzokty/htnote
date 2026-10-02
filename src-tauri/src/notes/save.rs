use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::fs_util::write_file_atomic;
use crate::index::resolve_in_root;

use super::html::sync_head;
use super::model::NoteMetadata;
use super::read::content_hash;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteInput {
    pub html: String,
    pub css: String,
    pub js: String,
    pub expected_hash: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteOutput {
    pub metadata: NoteMetadata,
    pub content_hash: String,
}

fn read_optional(path: &Path) -> Result<Option<Vec<u8>>, AppError> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn write_optional(path: &Path, bytes: Option<&[u8]>) -> Result<(), AppError> {
    if let Some(bytes) = bytes {
        write_file_atomic(path, bytes)
    } else {
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }
}

pub fn save_note_dir(dir: &Path, input: SaveNoteInput, now: DateTime<Utc>) -> Result<SaveNoteOutput, AppError> {
    save_note_dir_with_writer(dir, input, now, write_optional)
}

fn save_note_dir_with_writer(
    dir: &Path,
    input: SaveNoteInput,
    now: DateTime<Utc>,
    mut write: impl FnMut(&Path, Option<&[u8]>) -> Result<(), AppError>,
) -> Result<SaveNoteOutput, AppError> {
    let paths: Vec<PathBuf> = ["style.css", "script.js", "index.html", "metadata.json"]
        .iter().map(|name| resolve_in_root(dir, name)).collect::<Result<_, _>>()?;
    // Dosyalar yalnızca çözülmüş not dizininin içinde olabilir.
    let previous = paths.iter().map(|path| read_optional(path)).collect::<Result<Vec<_>, _>>()?;
    let old_html = previous[2].as_deref().ok_or_else(|| AppError::NotFound("index.html".into()))?;
    let old_metadata = previous[3].as_deref().ok_or_else(|| AppError::NotFound("metadata.json".into()))?;
    let current_hash = content_hash(old_html, previous[0].as_deref(), previous[1].as_deref());
    if input.expected_hash.as_deref().is_some_and(|expected| expected != current_hash) {
        return Err(AppError::Conflict("Note content changed on disk".into()));
    }

    // İçerik taslağı eski olabilir; favori ve etiketleri her zaman diskteki metadata'dan koru.
    let mut metadata: NoteMetadata = serde_json::from_slice(old_metadata)?;
    metadata.updated_at = now;
    metadata.has_custom_css = !input.css.trim().is_empty();
    metadata.has_custom_js = !input.js.trim().is_empty();
    let html = sync_head(&input.html, &metadata, metadata.has_custom_css, metadata.has_custom_js);
    let css = metadata.has_custom_css.then_some(input.css.as_bytes());
    let js = metadata.has_custom_js.then_some(input.js.as_bytes());
    let mut metadata_bytes = serde_json::to_vec_pretty(&metadata)?;
    metadata_bytes.push(b'\n');
    let next: [Option<&[u8]>; 4] = [css, js, Some(html.as_bytes()), Some(&metadata_bytes)];

    for (index, path) in paths.iter().enumerate() {
        if let Err(error) = write(path, next[index]) {
            // Geri dönüşte yalnızca bu işlem sırasında değiştirilmiş dosyalara dokunulur.
            let mut rollback_errors = Vec::new();
            for earlier in (0..index).rev() {
                if let Err(rollback_error) = write_optional(&paths[earlier], previous[earlier].as_deref()) {
                    rollback_errors.push(rollback_error.to_string());
                }
            }
            return if rollback_errors.is_empty() {
                Err(error)
            } else {
                Err(AppError::Io(std::io::Error::other(format!(
                    "Save failed: {error}; rollback failed: {}", rollback_errors.join("; ")
                ))))
            };
        }
    }
    Ok(SaveNoteOutput {
        metadata,
        content_hash: content_hash(html.as_bytes(), css, js),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::html::render_new_note_html;
    use crate::notes::model::write_metadata_atomic;
    use crate::notes::read::read_note_dir;

    fn fixture(dir: &Path) -> NoteMetadata {
        let meta = NoteMetadata::new("Başlık");
        write_metadata_atomic(&dir.join("metadata.json"), &meta).unwrap();
        fs::write(dir.join("index.html"), render_new_note_html(&meta)).unwrap();
        meta
    }

    fn input(css: &str, js: &str, expected_hash: Option<String>) -> SaveNoteInput {
        SaveNoteInput { html: "<main>Yeni içerik</main>".into(), css: css.into(), js: js.into(), expected_hash }
    }

    #[test]
    fn adds_and_removes_custom_files_and_syncs_head_and_hash() {
        let dir = tempfile::tempdir().unwrap();
        let mut meta = fixture(dir.path());
        meta.tags.push("etiket".into());
        write_metadata_atomic(&dir.path().join("metadata.json"), &meta).unwrap();
        let old_hash = read_note_dir(dir.path()).unwrap().content_hash;
        let now = meta.updated_at + chrono::Duration::seconds(1);
        let saved = save_note_dir(dir.path(), input("body {}", "run()", Some(old_hash)), now).unwrap();
        assert_eq!(saved.metadata.title, "Başlık");
        assert_eq!(saved.metadata.updated_at, now);
        assert!(saved.metadata.updated_at > meta.updated_at);
        assert!(saved.metadata.has_custom_css && saved.metadata.has_custom_js);
        assert_eq!(saved.content_hash, read_note_dir(dir.path()).unwrap().content_hash);
        let html = fs::read_to_string(dir.path().join("index.html")).unwrap();
        assert!(html.contains("<title>Başlık</title>"));
        assert!(html.contains("htnote-updated-at"));
        assert!(html.contains("etiket"));
        assert!(html.contains("./style.css"));
        assert!(html.contains("./script.js"));

        let removed = save_note_dir(dir.path(), input("  ", "\n", Some(saved.content_hash)), now + chrono::Duration::seconds(1)).unwrap();
        assert!(!removed.metadata.has_custom_css && !removed.metadata.has_custom_js);
        assert!(!dir.path().join("style.css").exists());
        assert!(!dir.path().join("script.js").exists());
        let html = fs::read_to_string(dir.path().join("index.html")).unwrap();
        assert!(!html.contains("./style.css"));
        assert!(!html.contains("./script.js"));
        assert_eq!(removed.content_hash, read_note_dir(dir.path()).unwrap().content_hash);
        assert!(fs::read_dir(dir.path()).unwrap().all(|entry| !entry.unwrap().file_name().to_string_lossy().ends_with(".tmp")));
    }

    #[test]
    fn conflict_preserves_disk_and_none_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        fixture(dir.path());
        fs::write(dir.path().join("index.html"), "external change").unwrap();
        let before = fs::read(dir.path().join("index.html")).unwrap();
        let metadata = fs::read(dir.path().join("metadata.json")).unwrap();
        assert!(matches!(save_note_dir(dir.path(), input("css", "js", Some("stale".into())), Utc::now()), Err(AppError::Conflict(_))));
        assert_eq!(fs::read(dir.path().join("index.html")).unwrap(), before);
        assert_eq!(fs::read(dir.path().join("metadata.json")).unwrap(), metadata);
        assert!(!dir.path().join("style.css").exists());
        save_note_dir(dir.path(), input("css", "js", None), Utc::now()).unwrap();
        assert!(dir.path().join("style.css").exists());
    }

    #[test]
    fn partial_write_failure_restores_previous_files() {
        let dir = tempfile::tempdir().unwrap();
        fixture(dir.path());
        fs::write(dir.path().join("style.css"), "old css").unwrap();
        let before = fs::read(dir.path().join("style.css")).unwrap();
        let mut calls = 0;
        let result = save_note_dir_with_writer(dir.path(), input("new css", "new js", None), Utc::now(), |path, bytes| {
            calls += 1;
            if calls == 3 { return Err(AppError::Io(std::io::Error::other("injected failure"))); }
            write_optional(path, bytes)
        });
        assert!(matches!(result, Err(AppError::Io(_))));
        assert_eq!(fs::read(dir.path().join("style.css")).unwrap(), before);
        assert!(!dir.path().join("script.js").exists());
        assert!(fs::read_dir(dir.path()).unwrap().all(|entry| !entry.unwrap().file_name().to_string_lossy().ends_with(".tmp")));
    }
}
