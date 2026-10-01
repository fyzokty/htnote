use std::fs;
use std::path::Path;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::fs_util::write_file_atomic;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DraftData {
    pub id: Uuid,
    pub html: String,
    pub css: String,
    pub js: String,
    pub base_hash: String,
    pub saved_at: DateTime<Utc>,
}

fn path_in(dir: &Path, id: Uuid) -> std::path::PathBuf {
    dir.join(format!("{id}.json"))
}

pub fn write_draft_in(dir: &Path, draft: &DraftData) -> Result<(), AppError> {
    fs::create_dir_all(dir)?;
    write_file_atomic(&path_in(dir, draft.id), &serde_json::to_vec(draft)?)
}

pub fn read_draft_in(dir: &Path, id: Uuid) -> Result<DraftData, AppError> {
    let path = path_in(dir, id);
    if !fs::symlink_metadata(&path)?.file_type().is_file() {
        return Err(AppError::InvalidName(id.to_string()));
    }
    let draft: DraftData = serde_json::from_slice(&fs::read(path)?)?;
    if draft.id != id {
        return Err(AppError::InvalidName(id.to_string()));
    }
    Ok(draft)
}

pub fn delete_draft_in(dir: &Path, id: Uuid) -> Result<(), AppError> {
    match fs::remove_file(path_in(dir, id)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

pub fn list_drafts_in(dir: &Path) -> Result<Vec<DraftData>, AppError> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let mut drafts = Vec::new();
    for entry in entries {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        // Sembolik bağlantılar taslak dizini dışındaki dosyaları okutamaz.
        if !entry.file_type().is_ok_and(|kind| kind.is_file()) { continue; }
        if path.extension().and_then(|value| value.to_str()) != Some("json") { continue; }
        let Some(id) = path.file_stem().and_then(|value| value.to_str()).and_then(|value| Uuid::parse_str(value).ok()) else { continue };
        if let Ok(draft) = read_draft_in(dir, id) { drafts.push(draft); }
    }
    Ok(drafts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_safe_deletion() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("drafts");
        let outside = root.path().join("keep.json");
        fs::write(&outside, "keep").unwrap();
        let id = Uuid::new_v4();
        let mut draft = DraftData { id, html: "one".into(), css: "".into(), js: "".into(), base_hash: "hash".into(), saved_at: Utc::now() };
        write_draft_in(&dir, &draft).unwrap();
        draft.html = "two".into();
        write_draft_in(&dir, &draft).unwrap();
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::write(dir.join("broken.json"), "{").unwrap();
        assert_eq!(read_draft_in(&dir, id).unwrap(), draft);
        assert_eq!(list_drafts_in(&dir).unwrap(), vec![draft]);
        delete_draft_in(&dir, id).unwrap();
        assert!(list_drafts_in(&dir).unwrap().is_empty());
        assert_eq!(fs::read_to_string(outside).unwrap(), "keep");
        assert!(Uuid::parse_str("../../keep").is_err());
        assert!(serde_json::from_value::<Uuid>(serde_json::json!("../../keep")).is_err());
    }
}
