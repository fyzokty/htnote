use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::fs_util::write_file_atomic;
use crate::index::resolve_in_root;

use super::html::sync_head;
use super::model::{read_metadata, write_metadata_atomic, NoteMetadata};
use super::naming::normalize_tags;
use super::read::read_note_dir;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataPatch {
    pub is_favorite: Option<bool>,
    pub tags: Option<Vec<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataUpdateResult {
    pub metadata: NoteMetadata,
    pub content_hash: String,
}

pub fn update_metadata_in(dir: &Path, patch: MetadataPatch) -> Result<MetadataUpdateResult, AppError> {
    let metadata_path = resolve_in_root(dir, "metadata.json")?;
    let html_path = resolve_in_root(dir, "index.html")?;
    let mut metadata = read_metadata(&metadata_path)?;
    if let Some(is_favorite) = patch.is_favorite {
        metadata.is_favorite = is_favorite;
    }
    let tags_changed = if let Some(tags) = patch.tags {
        let tags = normalize_tags(tags);
        let changed = tags != metadata.tags;
        metadata.tags = tags;
        changed
    } else { false };

    if tags_changed {
        let previous = fs::read(&html_path)?;
        let html = String::from_utf8(previous.clone()).map_err(|error| AppError::Io(std::io::Error::other(error)))?;
        let updated = sync_head(&html, &metadata, metadata.has_custom_css, metadata.has_custom_js);
        // Kullanıcı içeriği gövdede yaşar; başlık eşitlemesi onu değiştiremez.
        let body_start = html.to_ascii_lowercase().find("<body").ok_or_else(|| AppError::Conflict("HTML body is missing".into()))?;
        let updated_body_start = updated.to_ascii_lowercase().find("<body").ok_or_else(|| AppError::Conflict("HTML body is missing".into()))?;
        if html[body_start..] != updated[updated_body_start..] {
            return Err(AppError::Conflict("HTML body changed during metadata sync".into()));
        }
        write_file_atomic(&html_path, updated.as_bytes())?;
        if let Err(error) = write_metadata_atomic(&metadata_path, &metadata) {
            return match write_file_atomic(&html_path, &previous) {
                Ok(()) => Err(error),
                Err(rollback_error) => Err(AppError::Io(std::io::Error::other(format!(
                    "Metadata update failed: {error}; rollback failed: {rollback_error}"
                )))),
            };
        }
    } else {
        write_metadata_atomic(&metadata_path, &metadata)?;
    }
    let content_hash = read_note_dir(dir)?.content_hash;
    Ok(MetadataUpdateResult { metadata, content_hash })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::html::render_new_note_html;

    #[test]
    fn updates_tags_without_changing_body_or_timestamp_and_keeps_extra_fields() {
        let dir = tempfile::tempdir().unwrap();
        let mut metadata = NoteMetadata::new("Test");
        metadata.extra.insert("future".into(), serde_json::json!({"keep": true}));
        write_metadata_atomic(&dir.path().join("metadata.json"), &metadata).unwrap();
        let original_updated_at = read_metadata(&dir.path().join("metadata.json")).unwrap().updated_at;
        let html = render_new_note_html(&metadata);
        fs::write(dir.path().join("index.html"), &html).unwrap();
        let result = update_metadata_in(dir.path(), MetadataPatch { is_favorite: Some(true), tags: Some(vec![" İstanbul ".into(), "istanbul".into()]) }).unwrap();
        let written = fs::read_to_string(dir.path().join("index.html")).unwrap();
        assert_eq!(result.metadata.updated_at, original_updated_at);
        assert_eq!(result.metadata.tags, vec!["İstanbul"]);
        assert!(result.metadata.is_favorite);
        assert_eq!(result.metadata.extra["future"], serde_json::json!({"keep": true}));
        assert_eq!(&written[written.find("<body>").unwrap()..], &html[html.find("<body>").unwrap()..]);
        assert!(written.contains("htnote-tags\" content=\"İstanbul"));
        assert_eq!(result.content_hash, read_note_dir(dir.path()).unwrap().content_hash);

        let before = fs::read(dir.path().join("index.html")).unwrap();
        let favorite_only = update_metadata_in(dir.path(), MetadataPatch { is_favorite: Some(false), tags: None }).unwrap();
        assert_eq!(fs::read(dir.path().join("index.html")).unwrap(), before);
        assert_eq!(favorite_only.content_hash, result.content_hash);
    }
}
