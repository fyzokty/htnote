use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
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
    pub content_stamp: Option<(u64, std::time::SystemTime)>,
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
    scan_with_repair(root, true)
}

pub fn scan_readonly(root: &Path) -> Result<ScanResult, AppError> {
    scan_with_repair(root, false)
}

fn scan_with_repair(root: &Path, repair_metadata: bool) -> Result<ScanResult, AppError> {
    if !root.is_dir() { return Ok(ScanResult::default()); }
    let root = root.canonicalize()?;
    let mut result = ScanResult::default();
    let mut seen_ids = HashSet::new();
    let mut seen_dirs = HashSet::new();
    result.tree = scan_dir(&root, &root, &mut result.notes, &mut result.repairs, &mut seen_ids, &mut seen_dirs, repair_metadata)?;
    Ok(result)
}

fn scan_dir(root: &Path, dir: &Path, notes: &mut Vec<IndexedNote>, repairs: &mut Vec<Repair>, seen_ids: &mut HashSet<Uuid>, seen_dirs: &mut HashSet<PathBuf>, repair_metadata: bool) -> Result<Vec<TreeNode>, AppError> {
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
    // Eşit Türkçe anahtarlarda kararlı sıralama için önce ham adla dizilir.
    folders.sort_by(|a, b| a.0.cmp(&b.0));
    note_dirs.sort_by(|a, b| a.0.cmp(&b.0));
    folders.sort_by(|a, b| compare_names(&a.0, &b.0));
    note_dirs.sort_by(|a, b| compare_names(&a.0, &b.0));
    let mut tree = Vec::new();
    for (name, path) in folders {
        let children = scan_dir(root, &path, notes, repairs, seen_ids, seen_dirs, repair_metadata)?;
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
            Ok(value) => repair_fields(value, &name, &mut repair)?,
            Err(_) => { repair = Some(RepairKind::CorruptMetadata); NoteMetadata::new(&name) }
        };
        if !seen_ids.insert(metadata.id) {
            metadata.id = Uuid::new_v4();
            while !seen_ids.insert(metadata.id) { metadata.id = Uuid::new_v4(); }
            repair = Some(RepairKind::DuplicateId);
        }
        if let Some(kind) = repair {
            if repair_metadata {
                let backup = backup_metadata(&metadata_path, &original)?;
                write_metadata_atomic(&metadata_path, &metadata)?;
                repairs.push(Repair { rel_path: rel_path.clone(), kind, backup_path: backup.file_name().unwrap_or_default().to_string_lossy().into_owned() });
            }
        }
        tree.push(TreeNode::Note { id: metadata.id, title: metadata.title.clone(), rel_path: rel_path.clone(), is_favorite: metadata.is_favorite, tags: metadata.tags.clone(), updated_at: metadata.updated_at });
        let content_stamp = fs::metadata(path.join("index.html")).ok()
            .and_then(|file| file.modified().ok().map(|modified| (file.len(), modified)));
        notes.push(IndexedNote { rel_path, metadata, content_stamp });
    }
    Ok(tree)
}

fn backup_metadata(path: &Path, bytes: &[u8]) -> Result<PathBuf, AppError> {
    for number in 1.. {
        let name = if number == 1 { "metadata.json.bak".to_string() } else { format!("metadata.json.bak.{number}") };
        let backup = path.with_file_name(name);
        match OpenOptions::new().write(true).create_new(true).open(&backup) {
            Ok(mut file) => {
                let written = file.write_all(bytes).and_then(|_| file.sync_all());
                drop(file);
                if let Err(error) = written {
                    let _ = fs::remove_file(&backup);
                    return Err(error.into());
                }
                return Ok(backup);
            }
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
    key(left).cmp(&key(right))
}

fn repair_fields(mut value: Value, name: &str, repair: &mut Option<RepairKind>) -> Result<NoteMetadata, AppError> {
    let Some(fields) = value.as_object_mut() else {
        *repair = Some(RepairKind::CorruptMetadata);
        return Ok(NoteMetadata::new(name));
    };
    let defaults = serde_json::to_value(NoteMetadata::new(name))?;
    if fields.get("id").and_then(Value::as_str).and_then(|id| Uuid::parse_str(id).ok()).is_none() {
        fields.insert("id".into(), defaults["id"].clone());
        *repair = Some(RepairKind::MissingId);
    }
    for field in ["title", "createdAt", "updatedAt", "isFavorite", "tags", "hasCustomCss", "hasCustomJs"] {
        let valid = fields.get(field).is_some_and(|item| match field {
            "title" => item.as_str().is_some(),
            "createdAt" | "updatedAt" => item.as_str().is_some_and(|date| DateTime::parse_from_rfc3339(date).is_ok()),
            "tags" => item.as_array().is_some_and(|tags| tags.iter().all(Value::is_string)),
            _ => item.is_boolean(),
        });
        if !valid {
            fields.insert(field.into(), defaults[field].clone());
            *repair = Some(RepairKind::CorruptMetadata);
        }
    }
    Ok(serde_json::from_value(value)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(root: &Path, name: &str, id: Option<Uuid>) {
        let dir = root.join(name);
        fs::create_dir_all(&dir).unwrap();
        let title = name.rsplit('/').next().unwrap();
        let mut value = serde_json::to_value(NoteMetadata::new(title)).unwrap();
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
        fn shape(nodes: &[TreeNode]) -> Vec<Value> {
            nodes.iter().map(|node| match node {
                TreeNode::Folder { name, rel_path, children } => serde_json::json!({"type": "folder", "name": name, "relPath": rel_path, "children": shape(children)}),
                TreeNode::Note { title, rel_path, .. } => serde_json::json!({"type": "note", "title": title, "relPath": rel_path}),
            }).collect()
        }
        assert_eq!(shape(&result.tree), vec![
            serde_json::json!({"type": "folder", "name": "Yazılım", "relPath": "Yazılım", "children": [
                {"type": "folder", "name": "Web Geliştirme", "relPath": "Yazılım/Web Geliştirme", "children": [
                    {"type": "note", "title": "React Hooks Notları", "relPath": "Yazılım/Web Geliştirme/React Hooks Notları"}
                ]},
                {"type": "note", "title": "Rust Öğreniyorum", "relPath": "Yazılım/Rust Öğreniyorum"}
            ]}),
            serde_json::json!({"type": "note", "title": "Günlük Fikirler", "relPath": "Günlük Fikirler"}),
        ]);
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
    fn readonly_scan_does_not_repair_metadata() {
        let root = tempfile::tempdir().unwrap();
        note(root.path(), "A", None);
        let path = root.path().join("A/metadata.json");
        let before = fs::read(&path).unwrap();
        let result = scan_readonly(root.path()).unwrap();
        assert_eq!(result.notes.len(), 1);
        assert_eq!(result.notes[0].metadata.title, "A");
        assert_eq!(fs::read(&path).unwrap(), before);
        assert!(!path.with_file_name("metadata.json.bak").exists());
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

    #[test]
    fn missing_id_preserves_other_valid_fields_and_repairs_invalid_field_only() {
        let root = tempfile::tempdir().unwrap();
        note(root.path(), "A", None);
        let path = root.path().join("A/metadata.json");
        let mut value: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        value["title"] = serde_json::json!("Özgün başlık");
        value["tags"] = serde_json::json!(["etiket"]);
        value["isFavorite"] = serde_json::json!(true);
        value["createdAt"] = serde_json::json!("2020-01-01T00:00:00.000Z");
        value["updatedAt"] = serde_json::json!("2021-01-01T00:00:00.000Z");
        value["hasCustomCss"] = serde_json::json!("invalid");
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
        let result = scan(root.path()).unwrap();
        let metadata = &result.notes[0].metadata;
        assert_eq!(result.repairs[0].kind, RepairKind::CorruptMetadata);
        assert_eq!(metadata.title, "Özgün başlık");
        assert_eq!(metadata.tags, ["etiket"]);
        assert!(metadata.is_favorite);
        assert_eq!(metadata.created_at.to_rfc3339(), "2020-01-01T00:00:00+00:00");
        assert_eq!(metadata.updated_at.to_rfc3339(), "2021-01-01T00:00:00+00:00");
        assert!(!metadata.has_custom_css);
        assert_eq!(fs::read(path.with_file_name("metadata.json.bak")).unwrap(), serde_json::to_vec(&value).unwrap());
    }

    #[test]
    fn missing_id_alone_preserves_metadata() {
        let root = tempfile::tempdir().unwrap();
        note(root.path(), "A", None);
        let path = root.path().join("A/metadata.json");
        let mut value: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        value["title"] = serde_json::json!("Özgün");
        value["tags"] = serde_json::json!(["koru"]);
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
        let result = scan(root.path()).unwrap();
        assert_eq!(result.repairs[0].kind, RepairKind::MissingId);
        assert_eq!(result.notes[0].metadata.title, "Özgün");
        assert_eq!(result.notes[0].metadata.tags, ["koru"]);
    }

    #[test]
    fn file_root_returns_empty_tree() {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("root");
        fs::write(&file, "content").unwrap();
        assert!(scan(&file).unwrap().tree.is_empty());
    }
}
