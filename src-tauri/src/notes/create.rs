use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::fs_util::write_file_atomic;
use crate::index::rel_string;
use crate::index::resolve_in_root;
use crate::index::scan::{IndexedNote, TreeNode};

use super::html::render_new_note_html;
use super::model::{write_metadata_atomic, NoteMetadata};
use super::naming::{exists_ci, sanitize_name, unique_name};

fn parent_dir(root: &Path, parent_rel: &str) -> Result<PathBuf, AppError> {
    let parent = resolve_in_root(root, parent_rel)?;
    if !parent.exists() {
        return Err(AppError::NotFound(parent_rel.into()));
    }
    if !parent.is_dir() || parent.join("metadata.json").is_file() {
        return Err(AppError::NotAFolder(parent_rel.into()));
    }
    Ok(parent)
}

fn create_unique_dir(root: &Path, parent: &Path, desired: &str) -> Result<(PathBuf, String), AppError> {
    for _ in 0..10 {
        let names = fs::read_dir(parent)?
            .map(|entry| entry.map(|entry| entry.file_name().to_string_lossy().into_owned()))
            .collect::<Result<Vec<_>, _>>()?;
        let name = unique_name(&sanitize_name(desired), exists_ci(&names));
        let rel = parent.strip_prefix(root.canonicalize()?)
            .map_err(|error| AppError::Internal(error.to_string()))?
            .join(&name);
        let path = resolve_in_root(root, &rel_string(&rel))?;
        match fs::create_dir(&path) {
            Ok(()) => return Ok((path, rel_string(&rel))),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }
    Err(AppError::NameConflict(desired.into()))
}

pub fn create_folder_in(root: &Path, parent_rel: &str, name: &str) -> Result<TreeNode, AppError> {
    let parent = parent_dir(root, parent_rel)?;
    let (path, rel_path) = create_unique_dir(root, &parent, name)?;
    let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
    Ok(TreeNode::Folder { name, rel_path, children: Vec::new() })
}

pub fn create_note_in(root: &Path, parent_rel: &str, title: Option<&str>) -> Result<(TreeNode, IndexedNote), AppError> {
    create_note_with_writer(root, parent_rel, title, |path, metadata| {
        write_metadata_atomic(&path.join("metadata.json"), metadata)?;
        write_file_atomic(&path.join("index.html"), render_new_note_html(metadata).as_bytes())
    })
}

fn create_note_with_writer(
    root: &Path,
    parent_rel: &str,
    title: Option<&str>,
    write: impl FnOnce(&Path, &NoteMetadata) -> Result<(), AppError>,
) -> Result<(TreeNode, IndexedNote), AppError> {
    let parent = parent_dir(root, parent_rel)?;
    let title = title.map(str::trim).filter(|title| !title.is_empty()).unwrap_or("Adsız Not");
    let (path, rel_path) = create_unique_dir(root, &parent, title)?;
    let metadata = NoteMetadata::new(title);
    if let Err(error) = write(&path, &metadata) {
        // Yalnızca bu çağrının create_dir ile oluşturduğu dizin geri alınır.
        fs::remove_dir_all(&path).map_err(|rollback| {
            AppError::Internal(format!("Create failed: {error}; rollback failed: {rollback}"))
        })?;
        return Err(error);
    }
    let node = TreeNode::Note {
        id: metadata.id,
        title: metadata.title.clone(),
        rel_path: rel_path.clone(),
        is_favorite: metadata.is_favorite,
        tags: metadata.tags.clone(),
        updated_at: metadata.updated_at,
    };
    Ok((node, IndexedNote { rel_path, metadata, content_stamp: None }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_notes_and_folders_with_unique_paths() {
        let root = tempfile::tempdir().unwrap();
        let folder = create_folder_in(root.path(), "", "Alt").unwrap();
        assert!(matches!(folder, TreeNode::Folder { rel_path, .. } if rel_path == "Alt"));
        let (nested, _) = create_note_in(root.path(), "Alt", None).unwrap();
        assert!(matches!(nested, TreeNode::Note { rel_path, title, .. } if rel_path == "Alt/Adsız Not" && title == "Adsız Not"));
        for (expected, title) in [("Fikir", "Fikir"), ("Fikir (2)", "Fikir"), ("Fikir (3)", "Fikir")] {
            let (node, indexed) = create_note_in(root.path(), "", Some(title)).unwrap();
            assert!(matches!(node, TreeNode::Note { ref rel_path, .. } if rel_path == expected));
            let dir = root.path().join(expected);
            assert_eq!(indexed.rel_path, expected);
            assert!(dir.join("metadata.json").is_file());
            assert!(fs::read_to_string(dir.join("index.html")).unwrap().starts_with("<!DOCTYPE html>"));
            assert!(!dir.join("style.css").exists());
            assert!(!dir.join("script.js").exists());
            assert!(!dir.join("assets").exists());
        }
        fs::create_dir(root.path().join("fikir (4)")).unwrap();
        let (node, _) = create_note_in(root.path(), "", Some("Fikir")).unwrap();
        assert!(matches!(node, TreeNode::Note { rel_path, .. } if rel_path == "Fikir (5)"));
    }

    #[test]
    fn rejects_invalid_parents() {
        let root = tempfile::tempdir().unwrap();
        create_note_in(root.path(), "", Some("Not")).unwrap();
        assert!(matches!(create_folder_in(root.path(), "Not", "Alt"), Err(AppError::NotAFolder(_))));
        assert!(matches!(create_note_in(root.path(), "Not", None), Err(AppError::NotAFolder(_))));
        assert!(matches!(create_folder_in(root.path(), "../outside", "Alt"), Err(AppError::PathOutsideRoot(_))));
        assert!(matches!(create_note_in(root.path(), "missing", None), Err(AppError::NotFound(_))));
    }

    #[test]
    fn rolls_back_only_new_directory_on_write_failure() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("Keep")).unwrap();
        let result = create_note_with_writer(root.path(), "", Some("Broken"), |path, metadata| {
            write_metadata_atomic(&path.join("metadata.json"), metadata)?;
            Err(AppError::Io(std::io::Error::other("simulated write failure")))
        });
        assert!(matches!(result, Err(AppError::Io(_))));
        assert!(!root.path().join("Broken").exists());
        assert!(root.path().join("Keep").is_dir());
    }
}
