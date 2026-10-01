use std::fs;
use std::path::Path;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::error::AppError;
use crate::index::resolve_in_root;
use crate::notes::model::{read_metadata, NoteMetadata};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteData {
    pub metadata: NoteMetadata,
    pub html: String,
    pub css: Option<String>,
    pub js: Option<String>,
    pub content_hash: String,
}

fn read_optional(dir: &Path, name: &str) -> Result<Option<Vec<u8>>, AppError> {
    let path = resolve_in_root(dir, name)?;
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn hash_part(hasher: &mut Sha256, bytes: Option<&[u8]>) {
    match bytes {
        Some(bytes) => {
            hasher.update([1]);
            hasher.update((bytes.len() as u64).to_be_bytes());
            hasher.update(bytes);
        }
        None => hasher.update([0]),
    }
}

pub(crate) fn content_hash(html: &[u8], css: Option<&[u8]>, js: Option<&[u8]>) -> String {
    let mut hasher = Sha256::new();
    hash_part(&mut hasher, Some(html));
    hash_part(&mut hasher, css);
    hash_part(&mut hasher, js);
    format!("{:x}", hasher.finalize())
}

pub fn read_note_dir(dir: &Path) -> Result<NoteData, AppError> {
    let metadata = read_metadata(&resolve_in_root(dir, "metadata.json")?)?;
    let html_bytes = fs::read(resolve_in_root(dir, "index.html")?)?;
    let css_bytes = read_optional(dir, "style.css")?;
    let js_bytes = read_optional(dir, "script.js")?;
    let content_hash = content_hash(&html_bytes, css_bytes.as_deref(), js_bytes.as_deref());
    Ok(NoteData {
        metadata,
        html: String::from_utf8(html_bytes).map_err(|error| AppError::Io(std::io::Error::other(error)))?,
        css: css_bytes.map(|bytes| String::from_utf8(bytes).map_err(|error| AppError::Io(std::io::Error::other(error)))).transpose()?,
        js: js_bytes.map(|bytes| String::from_utf8(bytes).map_err(|error| AppError::Io(std::io::Error::other(error)))).transpose()?,
        content_hash,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::model::write_metadata_atomic;

    #[test]
    fn reads_optional_files_and_hashes_each_content_change() {
        let dir = tempfile::tempdir().unwrap();
        write_metadata_atomic(&dir.path().join("metadata.json"), &NoteMetadata::new("Test")).unwrap();
        fs::write(dir.path().join("index.html"), "one").unwrap();
        let first = read_note_dir(dir.path()).unwrap();
        assert_eq!(first.html, "one");
        assert!(first.css.is_none());
        assert!(first.js.is_none());

        fs::write(dir.path().join("index.html"), "two").unwrap();
        let second = read_note_dir(dir.path()).unwrap();
        assert_ne!(first.content_hash, second.content_hash);

        fs::write(dir.path().join("style.css"), "").unwrap();
        let third = read_note_dir(dir.path()).unwrap();
        assert_eq!(third.css.as_deref(), Some(""));
        assert_ne!(second.content_hash, third.content_hash);
        fs::write(dir.path().join("style.css"), "body {} ").unwrap();
        let fourth = read_note_dir(dir.path()).unwrap();
        assert_ne!(third.content_hash, fourth.content_hash);

        fs::write(dir.path().join("script.js"), "let x = 1;").unwrap();
        let fifth = read_note_dir(dir.path()).unwrap();
        assert_eq!(fifth.js.as_deref(), Some("let x = 1;"));
        assert_ne!(fourth.content_hash, fifth.content_hash);
        fs::write(dir.path().join("script.js"), "let x = 2;").unwrap();
        assert_ne!(fifth.content_hash, read_note_dir(dir.path()).unwrap().content_hash);
    }
}
