use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Component, Path};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::fs_util::write_file_atomic;
use crate::index::{rel_string, resolve_in_root};
use crate::notes::model::{read_metadata, write_metadata_atomic};
use crate::notes::naming::{exists_ci, sanitize_name, unique_name};
use crate::notes::html::sync_head;

const MANIFEST: &str = ".htnote-trash.json";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TrashKind { Note, Folder, Unknown }

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub trash_id: String,
    pub title: String,
    pub kind: TrashKind,
    pub original_rel_path: String,
    pub deleted_at: DateTime<Utc>,
    pub note_count: usize,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrashManifest {
    original_rel_path: String,
    deleted_at: DateTime<Utc>,
    kind: TrashKind,
    title: String,
    note_ids: Vec<Uuid>,
}

fn safe_rel(root: &Path, rel: &str) -> Result<std::path::PathBuf, AppError> {
    if rel.is_empty() || rel.split(['/', '\\']).any(|part| part.is_empty() || part.starts_with('.')) {
        return Err(AppError::PathOutsideRoot(rel.into()));
    }
    let path = resolve_in_root(root, rel)?;
    if path == root.canonicalize()? { return Err(AppError::PathOutsideRoot(rel.into())); }
    Ok(path)
}

fn trash_root(root: &Path) -> Result<std::path::PathBuf, AppError> {
    let root = root.canonicalize()?;
    let trash = root.join(".trash");
    if trash.symlink_metadata().is_ok() &&
        (trash.symlink_metadata()?.file_type().is_symlink() || trash.canonicalize()? != trash) {
        return Err(AppError::PathOutsideRoot(trash.to_string_lossy().into_owned()));
    }
    Ok(trash)
}

pub fn validate_trash_id(id: &str) -> Result<(), AppError> {
    if id.is_empty() || id == "." || id == ".." || id.chars().any(|ch| matches!(ch, '/' | '\\' | ':'))
        || Path::new(id).components().count() != 1
        || !matches!(Path::new(id).components().next(), Some(Component::Normal(_))) {
        return Err(AppError::InvalidTrashId(id.into()));
    }
    Ok(())
}

fn item_path(root: &Path, id: &str) -> Result<std::path::PathBuf, AppError> {
    validate_trash_id(id)?;
    let path = trash_root(root)?.join(id);
    if !path.is_dir() { return Err(AppError::NotFound(id.into())); }
    // Bağlantı hedefi .trash içinde olsa bile çöp öğesi olarak kabul edilmez.
    if path.symlink_metadata()?.file_type().is_symlink() {
        return Err(AppError::PathOutsideRoot(id.into()));
    }
    Ok(path)
}

fn collect_note_ids(dir: &Path, ids: &mut Vec<Uuid>) -> Result<(), AppError> {
    if dir.join("metadata.json").is_file() {
        ids.push(read_metadata(&dir.join("metadata.json"))?.id);
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() && !entry.file_type()?.is_symlink() {
            collect_note_ids(&entry.path(), ids)?;
        }
    }
    Ok(())
}

fn move_error(error: io::Error) -> AppError {
    #[cfg(windows)]
    if matches!(error.raw_os_error(), Some(5 | 32 | 33)) {
        return AppError::Locked(error.to_string());
    }
    #[cfg(unix)]
    if matches!(error.raw_os_error(), Some(16 | 26)) {
        return AppError::Locked(error.to_string());
    }
    AppError::Io(error)
}

pub fn delete_item(root: &Path, rel: &str) -> Result<TrashItem, AppError> {
    delete_item_with_rename(root, rel, |source, target| fs::rename(source, target))
}

fn delete_item_with_rename(root: &Path, rel: &str, rename: impl FnOnce(&Path, &Path) -> io::Result<()>) -> Result<TrashItem, AppError> {
    let source = safe_rel(root, rel)?;
    if !source.is_dir() || source.symlink_metadata()?.file_type().is_symlink() {
        return Err(AppError::NotFound(rel.into()));
    }
    let mut ids = Vec::new();
    collect_note_ids(&source, &mut ids)?;
    let kind = if source.join("metadata.json").is_file() { TrashKind::Note } else { TrashKind::Folder };
    let title = if kind == TrashKind::Note {
        read_metadata(&source.join("metadata.json"))?.title
    } else { source.file_name().unwrap_or_default().to_string_lossy().into_owned() };
    let deleted_at = Utc::now();
    let trash = trash_root(root)?;
    fs::create_dir_all(&trash)?;
    let name = source.file_name().unwrap_or_default().to_string_lossy();
    let base = format!("{name}__{}", deleted_at.format("%Y%m%d-%H%M%S"));
    let mut trash_id = base.clone();
    for number in 2.. {
        if !trash.join(&trash_id).exists() { break; }
        trash_id = format!("{base}-{number}");
    }
    let target = trash.join(&trash_id);
    rename(&source, &target).map_err(move_error)?;
    let manifest = TrashManifest { original_rel_path: rel_string(Path::new(rel)), deleted_at, kind: kind.clone(), title: title.clone(), note_ids: ids.clone() };
    let written = serde_json::to_vec_pretty(&manifest).map_err(AppError::from)
        .and_then(|bytes| write_file_atomic(&target.join(MANIFEST), &bytes));
    if let Err(error) = written {
        fs::rename(&target, &source).map_err(|rollback| AppError::Internal(format!("Manifest error: {error}; rollback error: {rollback}")))?;
        return Err(error);
    }
    Ok(TrashItem { trash_id, title, kind, original_rel_path: manifest.original_rel_path, deleted_at, note_count: ids.len() })
}

pub fn list_trash(root: &Path) -> Result<Vec<TrashItem>, AppError> {
    let trash = trash_root(root)?;
    if !trash.exists() { return Ok(Vec::new()); }
    let mut items = Vec::new();
    for entry in fs::read_dir(&trash)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() || entry.file_type()?.is_symlink() { continue; }
        let trash_id = entry.file_name().to_string_lossy().into_owned();
        let manifest = fs::read(entry.path().join(MANIFEST)).ok()
            .and_then(|bytes| serde_json::from_slice::<TrashManifest>(&bytes).ok());
        let item = if let Some(manifest) = manifest {
            TrashItem { trash_id, title: manifest.title, kind: manifest.kind, original_rel_path: manifest.original_rel_path, deleted_at: manifest.deleted_at, note_count: manifest.note_ids.len() }
        } else {
            let modified = entry.metadata()?.modified()?;
            TrashItem { title: trash_id.clone(), trash_id, kind: TrashKind::Unknown, original_rel_path: String::new(), deleted_at: modified.into(), note_count: 0 }
        };
        items.push(item);
    }
    items.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at).then_with(|| b.trash_id.cmp(&a.trash_id)));
    Ok(items)
}

pub fn restore_from_trash(root: &Path, id: &str, indexed_ids: &HashSet<Uuid>) -> Result<String, AppError> {
    restore_from_trash_with_writer(root, id, indexed_ids, write_metadata_atomic)
}

fn restore_from_trash_with_writer(
    root: &Path,
    id: &str,
    indexed_ids: &HashSet<Uuid>,
    mut write_metadata: impl FnMut(&Path, &crate::notes::model::NoteMetadata) -> Result<(), AppError>,
) -> Result<String, AppError> {
    let source = item_path(root, id)?;
    let manifest: TrashManifest = serde_json::from_slice(&fs::read(source.join(MANIFEST))?)?;
    if !matches!(manifest.kind, TrashKind::Note | TrashKind::Folder) { return Err(AppError::InvalidTrashId(id.into())); }
    let original = safe_rel(root, &manifest.original_rel_path)?;
    let parent = original.parent().ok_or_else(|| AppError::InvalidTrashId(id.into()))?;
    fs::create_dir_all(parent)?;
    let name = original.file_name().unwrap_or_default().to_string_lossy().into_owned();
    let siblings = fs::read_dir(parent)?.map(|entry| entry.map(|entry| entry.path()))
        .collect::<Result<Vec<_>, _>>()?;
    let (target_name, restored_title) = if manifest.kind == TrashKind::Note {
        let metadata = read_metadata(&source.join("metadata.json"))?;
        let mut occupied = Vec::new();
        let mut sibling_names = Vec::new();
        for sibling in &siblings {
            let sibling_name = sibling.file_name().unwrap_or_default().to_string_lossy().into_owned();
            occupied.push(sibling_name.clone());
            sibling_names.push(sibling_name);
            if sibling.join("metadata.json").is_file() {
                if let Ok(sibling_metadata) = read_metadata(&sibling.join("metadata.json")) {
                    occupied.push(sibling_metadata.title);
                }
            }
        }
        let title = unique_name(&metadata.title, exists_ci(&occupied));
        let folder_base = if title == metadata.title { name } else { sanitize_name(&title) };
        let folder_name = unique_name(&folder_base, exists_ci(&sibling_names));
        (folder_name, (title != metadata.title).then_some(title))
    } else {
        let names = siblings.iter().map(|path| path.file_name().unwrap_or_default().to_string_lossy().into_owned()).collect::<Vec<_>>();
        (unique_name(&name, exists_ci(&names)), None)
    };
    let target = parent.join(target_name);
    fs::rename(&source, &target).map_err(move_error)?;
    if let Some(title) = restored_title {
        let metadata_path = target.join("metadata.json");
        let original_metadata = fs::read(&metadata_path)?;
        let mut metadata = read_metadata(&metadata_path)?;
        let original_html = fs::read_to_string(target.join("index.html"))?;
        metadata.title = title;
        let html = sync_head(&original_html, &metadata, target.join("style.css").is_file(), target.join("script.js").is_file());
        if let Err(error) = write_metadata(&metadata_path, &metadata).and_then(|_| write_file_atomic(&target.join("index.html"), html.as_bytes())) {
            let _ = write_file_atomic(&metadata_path, &original_metadata);
            fs::rename(&target, &source).map_err(|rollback| AppError::Internal(format!("Title update error: {error}; rollback error: {rollback}")))?;
            return Err(error);
        }
    }
    if let Err(error) = reassign_collisions(&target, indexed_ids, &mut write_metadata) {
        fs::rename(&target, &source).map_err(|rollback| {
            AppError::Internal(format!("Metadata error: {error}; rollback error: {rollback}"))
        })?;
        return Err(error);
    }
    if let Err(error) = fs::remove_file(target.join(MANIFEST)) {
        fs::rename(&target, &source).map_err(|rollback| {
            AppError::Internal(format!("Manifest cleanup error: {error}; rollback error: {rollback}"))
        })?;
        return Err(AppError::Io(error));
    }
    Ok(rel_string(target.strip_prefix(root.canonicalize()?).map_err(|error| AppError::Internal(error.to_string()))?))
}

fn reassign_collisions(
    dir: &Path,
    indexed_ids: &HashSet<Uuid>,
    write_metadata: &mut impl FnMut(&Path, &crate::notes::model::NoteMetadata) -> Result<(), AppError>,
) -> Result<(), AppError> {
    let mut changes = Vec::new();
    collect_collisions(dir, indexed_ids, &mut changes)?;
    for (index, (path, _, metadata)) in changes.iter().enumerate() {
        if let Err(error) = write_metadata(path, metadata) {
            let mut rollback_error = None;
            for (path, original, _) in changes[..index].iter().rev() {
                if let Err(rollback) = write_file_atomic(path, original) {
                    rollback_error = Some(rollback);
                }
            }
            if let Some(rollback) = rollback_error {
                return Err(AppError::Internal(format!("Metadata error: {error}; rollback error: {rollback}")));
            }
            return Err(error);
        }
    }
    Ok(())
}

fn collect_collisions(
    dir: &Path,
    indexed_ids: &HashSet<Uuid>,
    changes: &mut Vec<(std::path::PathBuf, Vec<u8>, crate::notes::model::NoteMetadata)>,
) -> Result<(), AppError> {
    if dir.join("metadata.json").is_file() {
        let path = dir.join("metadata.json");
        let mut metadata = read_metadata(&path)?;
        if indexed_ids.contains(&metadata.id) {
            let original = fs::read(&path)?;
            metadata.id = Uuid::new_v4();
            while indexed_ids.contains(&metadata.id) { metadata.id = Uuid::new_v4(); }
            changes.push((path, original, metadata));
        }
    } else {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() && !entry.file_type()?.is_symlink() {
                collect_collisions(&entry.path(), indexed_ids, changes)?;
            }
        }
    }
    Ok(())
}

fn remove_in_trash_only(root: &Path, target: &Path) -> Result<(), AppError> {
    let trash = trash_root(root)?.canonicalize()?;
    let metadata = target.symlink_metadata()?;
    if metadata.file_type().is_symlink() { return Err(AppError::PathOutsideRoot(target.display().to_string())); }
    let canonical = target.canonicalize()?;
    // Yalnızca .trash altındaki doğrudan öğeler silinebilir; kökün kendisi asla silinmez.
    if canonical.parent() != Some(trash.as_path()) || !canonical.starts_with(&trash) {
        return Err(AppError::PathOutsideRoot(target.display().to_string()));
    }
    if metadata.is_dir() { fs::remove_dir_all(target)?; } else { fs::remove_file(target)?; }
    Ok(())
}

pub fn delete_permanently(root: &Path, id: &str) -> Result<(), AppError> {
    let target = item_path(root, id)?;
    remove_in_trash_only(root, &target)
}

pub fn empty_trash(root: &Path) -> Result<(), AppError> {
    let trash = trash_root(root)?;
    if !trash.exists() { return Ok(()); }
    for entry in fs::read_dir(&trash)? {
        remove_in_trash_only(root, &entry?.path())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::create::create_note_in;

    #[test]
    fn delete_list_restore_and_collisions() {
        let root = tempfile::tempdir().unwrap();
        let (_, first) = create_note_in(root.path(), "", Some("Note")).unwrap();
        let item = delete_item(root.path(), "Note").unwrap();
        assert_eq!(item.kind, TrashKind::Note);
        assert_eq!(item.note_count, 1);
        assert!(!root.path().join("Note").exists());
        assert_eq!(list_trash(root.path()).unwrap()[0].trash_id, item.trash_id);
        let restored = restore_from_trash(root.path(), &item.trash_id, &HashSet::new()).unwrap();
        assert_eq!(restored, "Note");
        assert_eq!(read_metadata(&root.path().join("Note/metadata.json")).unwrap().id, first.metadata.id);
        let second = delete_item(root.path(), "Note").unwrap();
        create_note_in(root.path(), "", Some("Note")).unwrap();
        let restored = restore_from_trash(root.path(), &second.trash_id, &HashSet::from([first.metadata.id])).unwrap();
        assert_eq!(restored, "Note (2)");
        let metadata = read_metadata(&root.path().join("Note (2)/metadata.json")).unwrap();
        assert_eq!(metadata.title, "Note (2)");
        assert_ne!(metadata.id, first.metadata.id);
        let html = fs::read_to_string(root.path().join("Note (2)/index.html")).unwrap();
        assert!(html.contains("<title>Note (2)</title>"));
    }

    #[test]
    fn restore_note_collision_checks_visible_sibling_titles_and_preserves_id() {
        let root = tempfile::tempdir().unwrap();
        let (_, restored_note) = create_note_in(root.path(), "", Some("Başlık")).unwrap();
        let item = delete_item(root.path(), "Başlık").unwrap();
        fs::create_dir(root.path().join("Different folder")).unwrap();
        let (_, sibling) = create_note_in(root.path(), "Different folder", Some("Başlık")).unwrap();
        // A sibling note's displayed title can collide even when its folder is nested.
        let (_, direct_sibling) = create_note_in(root.path(), "", Some("Başlık")).unwrap();
        let restored = restore_from_trash(root.path(), &item.trash_id, &HashSet::new()).unwrap();
        assert_eq!(restored, "Başlık (2)");
        let metadata = read_metadata(&root.path().join("Başlık (2)/metadata.json")).unwrap();
        assert_eq!(metadata.title, "Başlık (2)");
        assert_eq!(metadata.id, restored_note.metadata.id);
        assert_ne!(metadata.id, sibling.metadata.id);
        assert_ne!(metadata.id, direct_sibling.metadata.id);
        let html = fs::read_to_string(root.path().join("Başlık (2)/index.html")).unwrap();
        assert!(html.contains("<title>Başlık (2)</title>"));
    }

    #[test]
    fn restore_folder_name_collision_adds_suffix() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("Folder")).unwrap();
        let item = delete_item(root.path(), "Folder").unwrap();
        fs::create_dir(root.path().join("Folder")).unwrap();
        assert_eq!(restore_from_trash(root.path(), &item.trash_id, &HashSet::new()).unwrap(), "Folder (2)");
        assert!(root.path().join("Folder (2)").is_dir());
    }

    #[test]
    fn restore_title_collision_sanitizes_invalid_folder_characters() {
        let root = tempfile::tempdir().unwrap();
        let (_, trashed_note) = create_note_in(root.path(), "", Some("Başlık:/?*")).unwrap();
        let item = delete_item(root.path(), "Başlık----").unwrap();
        create_note_in(root.path(), "", Some("Başlık:/?*")).unwrap();

        let restored = restore_from_trash(root.path(), &item.trash_id, &HashSet::new()).unwrap();
        assert_eq!(restored, "Başlık---- (2)");
        let metadata = read_metadata(&root.path().join(&restored).join("metadata.json")).unwrap();
        assert_eq!(metadata.title, "Başlık---- (2)");
        assert_eq!(metadata.id, trashed_note.metadata.id);
    }

    #[test]
    fn restore_note_folder_name_collision_is_unique_even_without_title_collision() {
        let root = tempfile::tempdir().unwrap();
        create_note_in(root.path(), "", Some("Different title")).unwrap();
        fs::rename(root.path().join("Different title"), root.path().join("Shared")).unwrap();
        let item = delete_item(root.path(), "Shared").unwrap();
        fs::create_dir(root.path().join("Shared")).unwrap();

        assert_eq!(restore_from_trash(root.path(), &item.trash_id, &HashSet::new()).unwrap(), "Shared (2)");
        assert_eq!(read_metadata(&root.path().join("Shared (2)/metadata.json")).unwrap().title, "Different title");
    }

    #[test]
    fn restore_ignores_malformed_sibling_metadata() {
        let root = tempfile::tempdir().unwrap();
        create_note_in(root.path(), "", Some("Note")).unwrap();
        let item = delete_item(root.path(), "Note").unwrap();
        fs::create_dir(root.path().join("Unrelated")).unwrap();
        fs::write(root.path().join("Unrelated/metadata.json"), b"not valid json").unwrap();

        assert_eq!(restore_from_trash(root.path(), &item.trash_id, &HashSet::new()).unwrap(), "Note");
        assert!(root.path().join("Note/metadata.json").is_file());
    }

    #[test]
    fn folder_missing_parent_and_same_second_suffix() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("Parent/Child")).unwrap();
        create_note_in(root.path(), "Parent/Child", Some("Note")).unwrap();
        let first = delete_item(root.path(), "Parent/Child").unwrap();
        assert_eq!(first.note_count, 1);
        fs::create_dir(root.path().join("Parent/Child")).unwrap();
        let second = delete_item(root.path(), "Parent/Child").unwrap();
        assert_ne!(first.trash_id, second.trash_id);
        fs::remove_dir(root.path().join("Parent")).unwrap();
        assert_eq!(restore_from_trash(root.path(), &first.trash_id, &HashSet::new()).unwrap(), "Parent/Child");
        assert!(root.path().join("Parent/Child/Note").exists());
    }

    #[test]
    fn corrupt_manifest_and_permanent_removal() {
        let root = tempfile::tempdir().unwrap();
        assert!(empty_trash(root.path()).is_ok());
        fs::create_dir_all(root.path().join(".trash/broken")).unwrap();
        fs::write(root.path().join(".trash/broken/.htnote-trash.json"), b"{").unwrap();
        assert_eq!(list_trash(root.path()).unwrap()[0].kind, TrashKind::Unknown);
        fs::create_dir(root.path().join(".trash/missing")).unwrap();
        fs::create_dir(root.path().join("outside")).unwrap();
        for id in ["..", "../outside", "..\\outside", ".", "", "/outside", "C:\\outside"] {
            assert!(delete_permanently(root.path(), id).is_err());
            assert!(root.path().join("outside").exists());
        }
        delete_permanently(root.path(), "broken").unwrap();
        assert!(!root.path().join(".trash/broken").exists());
        empty_trash(root.path()).unwrap();
        assert!(list_trash(root.path()).unwrap().is_empty());
        assert!(root.path().join("outside").exists());
    }

    #[test]
    fn rejects_internal_and_root_paths_and_sorts_by_deletion_time() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("Keep")).unwrap();
        for rel in ["", ".", ".trash", "Keep/..", "../Keep"] {
            assert!(delete_item(root.path(), rel).is_err());
            assert!(root.path().join("Keep").exists());
        }
        let first = delete_item(root.path(), "Keep").unwrap();
        fs::create_dir(root.path().join("Keep")).unwrap();
        let second = delete_item(root.path(), "Keep").unwrap();
        let old_path = root.path().join(".trash").join(&first.trash_id).join(MANIFEST);
        let mut old: TrashManifest = serde_json::from_slice(&fs::read(&old_path).unwrap()).unwrap();
        old.deleted_at -= chrono::Duration::days(1);
        fs::write(old_path, serde_json::to_vec(&old).unwrap()).unwrap();
        assert_eq!(list_trash(root.path()).unwrap().iter().map(|item| item.trash_id.as_str()).collect::<Vec<_>>(),
            vec![second.trash_id.as_str(), first.trash_id.as_str()]);
    }

    #[test]
    fn rename_failure_preserves_source() {
        let root = tempfile::tempdir().unwrap();
        create_note_in(root.path(), "", Some("Keep")).unwrap();
        let error = delete_item_with_rename(root.path(), "Keep", |_, _| {
            Err(io::Error::other("rename failed"))
        }).unwrap_err();
        assert!(matches!(error, AppError::Io(_)));
        assert!(root.path().join("Keep/metadata.json").exists());
        assert!(list_trash(root.path()).unwrap().is_empty());
    }

    #[test]
    fn failed_restore_keeps_trash_metadata_ids() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("Folder")).unwrap();
        let (_, first) = create_note_in(root.path(), "Folder", Some("First")).unwrap();
        let (_, second) = create_note_in(root.path(), "Folder", Some("Second")).unwrap();
        let item = delete_item(root.path(), "Folder").unwrap();
        let mut writes = 0;
        let error = restore_from_trash_with_writer(
            root.path(),
            &item.trash_id,
            &HashSet::from([first.metadata.id, second.metadata.id]),
            |path, metadata| {
                writes += 1;
                if writes == 2 { return Err(AppError::Internal("simulated write failure".into())); }
                write_metadata_atomic(path, metadata)
            },
        ).unwrap_err();
        assert!(matches!(error, AppError::Internal(_)));
        assert_eq!(writes, 2);
        assert!(!root.path().join("Folder").exists());
        let trashed = root.path().join(".trash").join(&item.trash_id);
        assert_eq!(read_metadata(&trashed.join("First/metadata.json")).unwrap().id, first.metadata.id);
        assert_eq!(read_metadata(&trashed.join("Second/metadata.json")).unwrap().id, second.metadata.id);
    }

    #[cfg(windows)]
    #[test]
    fn sharing_violation_maps_to_file_locked_and_preserves_source() {
        let root = tempfile::tempdir().unwrap();
        create_note_in(root.path(), "", Some("Keep")).unwrap();
        let error = delete_item_with_rename(root.path(), "Keep", |_, _| {
            Err(io::Error::from_raw_os_error(32))
        }).unwrap_err();
        assert_eq!(error.code(), "FILE_LOCKED");
        assert!(root.path().join("Keep/metadata.json").exists());
        assert!(list_trash(root.path()).unwrap().is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn busy_unix_files_map_to_file_locked_and_preserve_source() {
        for code in [16, 26] {
            let root = tempfile::tempdir().unwrap();
            create_note_in(root.path(), "", Some("Keep")).unwrap();
            let error = delete_item_with_rename(root.path(), "Keep", |_, _| {
                Err(io::Error::from_raw_os_error(code))
            }).unwrap_err();
            assert_eq!(error.code(), "FILE_LOCKED");
            assert!(root.path().join("Keep/metadata.json").exists());
        }
    }

    #[cfg(unix)]
    #[test]
    fn symlink_target_is_rejected() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join(".trash")).unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join(".trash/link")).unwrap();
        assert!(delete_permanently(root.path(), "link").is_err());
        assert!(empty_trash(root.path()).is_err());
        assert!(outside.path().exists());
    }

    #[cfg(windows)]
    #[test]
    fn symlink_target_is_rejected_when_permitted() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join(".trash")).unwrap();
        if std::os::windows::fs::symlink_dir(outside.path(), root.path().join(".trash/link")).is_ok() {
            assert!(delete_permanently(root.path(), "link").is_err());
            assert!(empty_trash(root.path()).is_err());
            assert!(outside.path().exists());
        }
    }
}
