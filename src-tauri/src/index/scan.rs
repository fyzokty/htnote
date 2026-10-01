use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::notes::model::{write_metadata_atomic, NoteMetadata};
use crate::notes::naming::turkish_lowercase;

use super::rel_string;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TreeNode {
    Folder { name: String, #[serde(rename = "relPath")] rel_path: String, children: Vec<TreeNode> },
    Note { id: Uuid, title: String, #[serde(rename = "relPath")] rel_path: String, #[serde(rename = "isFavorite")] is_favorite: bool, tags: Vec<String>, #[serde(rename = "updatedAt")] updated_at: DateTime<Utc> },
}

#[derive(Clone, Debug)]
pub struct IndexedNote {
    pub rel_path: String,
    pub metadata: NoteMetadata,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RepairKind { CorruptMetadata, MissingId, DuplicateId }

#[derive(Clone, Debug)]
pub struct Repair {
    pub rel_path: String,
    pub kind: RepairKind,
    pub backup_path: String,
}

#[derive(Default)]
pub struct ScanResult {
    pub tree: Vec<TreeNode>,
    pub notes: Vec<IndexedNote>,
    pub repairs: Vec<Repair>,
}

pub fn scan(root: &Path) -> Result<ScanResult, AppError> {
    if !root.exists() { return Ok(ScanResult::default()); }
    let root = root.canonicalize()?;
    let mut result = ScanResult::default();
    let mut seen_ids = HashSet::new();
    let mut seen_dirs = HashSet::new();
    result.tree = scan_dir(&root, &root, &mut result.notes, &mut result.repairs, &mut seen_ids, &mut seen_dirs)?;
    Ok(result)
}

fn scan_dir(root: &Path, dir: &Path, notes: &mut Vec<IndexedNote>, repairs: &mut Vec<Repair>, seen_ids: &mut HashSet<Uuid>, seen_dirs: &mut HashSet<PathBuf>) -> Result<Vec<TreeNode>, AppError> {
    let canonical = dir.canonicalize()?;
    if !canonical.starts_with(root) || !seen_dirs.insert(canonical) { return Ok(Vec::new()); }
    let mut folders = Vec::new();
    let mut note_dirs = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || !entry.file_type()?.is_dir() { continue; }
        let path = entry.path();
        // Bağlantı ve junction hedeflerini taramayız; döngü ve kök dışına çıkış önlenir.
        if entry.file_type()?.is_symlink() || !path.canonicalize()?.starts_with(root) { continue; }
        if path.join("metadata.json").is_file() { note_dirs.push((name, path)); }
        else { folders.push((name, path)); }
    }
    folders.sort_by(|a, b| compare_names(&a.0, &b.0));
    note_dirs.sort_by(|a, b| compare_names(&a.0, &b.0));
    let mut tree = Vec::new();
    for (name, path) in folders {
        let children = scan_dir(root, &path, notes, repairs, seen_ids, seen_dirs)?;
        tree.push(TreeNode::Folder { name, rel_path: rel_string(path.strip_prefix(root).map_err(|error| AppError::Internal(error.to_string()))?), children });
    }
    for (name, path) in note_dirs {
        let rel_path = rel_string(path.strip_prefix(root).map_err(|error| AppError::Internal(error.to_string()))?);
        let metadata_path = path.join("metadata.json");
        if metadata_path.symlink_metadata()?.file_type().is_symlink() { continue; }
        let original = fs::read(&metadata_path)?;
        let parsed = serde_json::from_slice::<serde_json::Value>(&original);
        let mut repair = None;
        let mut metadata = match parsed {
            Ok(mut value) => {
                if value.get("id").is_none() || value.get("id").is_some_and(serde_json::Value::is_null) {
                    if let Some(object) = value.as_object_mut() {
                        object.insert("id".into(), serde_json::json!(Uuid::new_v4()));
                    }
                    repair = Some(RepairKind::MissingId);
                }
                match serde_json::from_value::<NoteMetadata>(value) {
                    Ok(metadata) => metadata,
                    Err(_) => { repair = Some(RepairKind::CorruptMetadata); NoteMetadata::new(&name) }
                }
            }
            Err(_) => { repair = Some(RepairKind::CorruptMetadata); NoteMetadata::new(&name) }
        };
        if !seen_ids.insert(metadata.id) {
            metadata.id = Uuid::new_v4();
            while !seen_ids.insert(metadata.id) { metadata.id = Uuid::new_v4(); }
            repair = Some(RepairKind::DuplicateId);
        }
        if let Some(kind) = repair {
            let backup = backup_metadata(&metadata_path, &original)?;
            write_metadata_atomic(&metadata_path, &metadata)?;
            repairs.push(Repair { rel_path: rel_path.clone(), kind, backup_path: backup.file_name().unwrap_or_default().to_string_lossy().into_owned() });
        }
        tree.push(TreeNode::Note { id: metadata.id, title: metadata.title.clone(), rel_path: rel_path.clone(), is_favorite: metadata.is_favorite, tags: metadata.tags.clone(), updated_at: metadata.updated_at });
        notes.push(IndexedNote { rel_path, metadata });
    }
    Ok(tree)
}

fn backup_metadata(path: &Path, bytes: &[u8]) -> Result<PathBuf, AppError> {
    for number in 1.. {
        let name = if number == 1 { "metadata.json.bak".to_string() } else { format!("metadata.json.bak.{number}") };
        let backup = path.with_file_name(name);
        match OpenOptions::new().write(true).create_new(true).open(&backup) {
            Ok(mut file) => { file.write_all(bytes)?; file.sync_all()?; return Ok(backup); }
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }
    unreachable!()
}

fn compare_names(left: &str, right: &str) -> std::cmp::Ordering {
    fn key(name: &str) -> Vec<u32> {
        let alphabet = "abcçdefgğhıijklmnoöprsştuüvyz";
        turkish_lowercase(name).chars().map(|ch| alphabet.chars().position(|letter| letter == ch).map_or(1000 + ch as u32, |index| index as u32)).collect()
    }
    key(left).cmp(&key(right)).then_with(|| left.cmp(right))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(root: &Path, name: &str, id: Option<Uuid>) {
        let dir = root.join(name);
        fs::create_dir_all(&dir).unwrap();
        let mut value = serde_json::to_value(NoteMetadata::new(name)).unwrap();
        if let Some(id) = id { value["id"] = serde_json::json!(id); } else { value.as_object_mut().unwrap().remove("id"); }
        fs::write(dir.join("metadata.json"), serde_json::to_vec(&value).unwrap()).unwrap();
    }

    #[test]
    fn scans_hierarchy_and_ignores_hidden_and_note_children() {
        let root = tempfile::tempdir().unwrap();
        note(root.path(), "Günlük Fikirler", Some(Uuid::new_v4()));
        note(root.path(), "Yazılım/Web Geliştirme/React Hooks Notları", Some(Uuid::new_v4()));
        note(root.path(), "Yazılım/Rust Öğreniyorum", Some(Uuid::new_v4()));
        fs::create_dir_all(root.path().join(".trash/Eski")).unwrap();
        fs::create_dir_all(root.path().join("Günlük Fikirler/assets/nested")).unwrap();
        let result = scan(root.path()).unwrap();
        assert_eq!(result.notes.len(), 3);
        assert!(matches!(&result.tree[0], TreeNode::Folder { name, children, .. } if name == "Yazılım" && children.len() == 2));
        assert!(matches!(&result.tree[1], TreeNode::Note { rel_path, .. } if rel_path == "Günlük Fikirler"));
        assert!(result.notes.iter().any(|note| note.rel_path == "Yazılım/Web Geliştirme/React Hooks Notları"));
        assert!(scan(tempfile::tempdir().unwrap().path()).unwrap().tree.is_empty());
    }

    #[test]
    fn repairs_corrupt_missing_and_duplicate_metadata() {
        let root = tempfile::tempdir().unwrap();
        let id = Uuid::new_v4();
        note(root.path(), "A", Some(id));
        note(root.path(), "B", Some(id));
        note(root.path(), "C", None);
        fs::create_dir(root.path().join("D")).unwrap();
        fs::write(root.path().join("D/metadata.json"), "broken").unwrap();
        fs::write(root.path().join("D/metadata.json.bak"), "old").unwrap();
        let result = scan(root.path()).unwrap();
        assert_eq!(result.repairs.len(), 3);
        assert!(result.repairs.iter().any(|repair| repair.rel_path == "B" && repair.kind == RepairKind::DuplicateId));
        assert!(result.repairs.iter().any(|repair| repair.rel_path == "C" && repair.kind == RepairKind::MissingId));
        assert!(result.repairs.iter().any(|repair| repair.rel_path == "D" && repair.kind == RepairKind::CorruptMetadata && repair.backup_path == "metadata.json.bak.2"));
        assert_eq!(result.notes[0].metadata.id, id);
        assert_ne!(result.notes[1].metadata.id, id);
        assert_eq!(fs::read_to_string(root.path().join("D/metadata.json.bak.2")).unwrap(), "broken");
        assert_eq!(fs::read_to_string(root.path().join("D/metadata.json.bak")).unwrap(), "old");
        assert!(scan(root.path()).unwrap().repairs.is_empty());
    }

    #[test]
    fn turkish_order_places_folders_before_notes() {
        let root = tempfile::tempdir().unwrap();
        for name in ["Çay", "çorba", "Zeytin", "ılık", "İzmir"] { note(root.path(), name, Some(Uuid::new_v4())); }
        fs::create_dir(root.path().join("Klasör")).unwrap();
        let result = scan(root.path()).unwrap();
        let names: Vec<_> = result.tree.iter().map(|node| match node { TreeNode::Folder { name, .. } => name.as_str(), TreeNode::Note { title, .. } => title.as_str() }).collect();
        assert_eq!(names, ["Klasör", "Çay", "çorba", "ılık", "İzmir", "Zeytin"]);
    }
}
