use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use uuid::Uuid;

use crate::error::AppError;
use crate::fs_util::write_file_atomic;
use crate::index::{rel_string, resolve_in_root};
use crate::index::scan::{IndexedNote, TreeNode};

use super::html::sync_head;
use super::model::{read_metadata, write_metadata_atomic};
use super::naming::{exists_ci, names_equal_ci, sanitize_name, unique_name};

fn source_dir(root: &Path, rel: &str) -> Result<PathBuf, AppError> {
    if rel.is_empty() || Path::new(rel).components().all(|component| component == std::path::Component::CurDir) {
        return Err(AppError::InvalidMove(rel.into()));
    }
    let path = resolve_in_root(root, rel)?;
    if path == root.canonicalize()? { return Err(AppError::InvalidMove(rel.into())); }
    if !path.exists() { return Err(AppError::NotFound(rel.into())); }
    if !path.is_dir() { return Err(AppError::NotAFolder(rel.into())); }
    Ok(path)
}

fn target_folder(root: &Path, rel: &str) -> Result<PathBuf, AppError> {
    let path = resolve_in_root(root, rel)?;
    if !path.exists() { return Err(AppError::NotFound(rel.into())); }
    if !path.is_dir() || path.join("metadata.json").is_file() {
        return Err(AppError::NotAFolder(rel.into()));
    }
    Ok(path)
}

fn relative(root: &Path, path: &Path) -> Result<String, AppError> {
    Ok(rel_string(path.strip_prefix(root.canonicalize()?)
        .map_err(|error| AppError::Internal(error.to_string()))?))
}

fn destination(parent: &Path, source: &Path, desired: &str) -> Result<PathBuf, AppError> {
    let source_name = source.file_name().unwrap_or_default().to_string_lossy();
    let source_canonical = source.canonicalize()?;
    let mut siblings = Vec::new();
    for entry in fs::read_dir(parent)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        // Aynı adlı ayrı bir kardeş gerçek çakışmadır; yalnız kaynak nesnesi dışlanır.
        let is_source = names_equal_ci(&name, &source_name)
            && entry.path().canonicalize().ok().as_deref() == Some(source_canonical.as_path());
        if !is_source {
            siblings.push(name);
        }
    }
    let name = unique_name(&sanitize_name(desired), exists_ci(&siblings));
    Ok(parent.join(name))
}

fn rename_dir(source: &Path, target: &Path) -> Result<(), AppError> {
    if source == target { return Ok(()); }
    let old_name = source.file_name().unwrap_or_default().to_string_lossy();
    let new_name = target.file_name().unwrap_or_default().to_string_lossy();
    if source.parent() == target.parent() && names_equal_ci(&old_name, &new_name) {
        // Windows aynı dosyayı hedef sayabilir; ara ad aynı üst dizinde kalır.
        let temporary = source.with_file_name(format!(".htnote-rename-{}", Uuid::new_v4()));
        fs::rename(source, &temporary)?;
        if let Err(error) = fs::rename(&temporary, target) {
            fs::rename(&temporary, source).map_err(|rollback| {
                AppError::Internal(format!("Rename failed: {error}; rollback failed: {rollback}"))
            })?;
            return Err(error.into());
        }
    } else {
        fs::rename(source, target)?;
    }
    Ok(())
}

fn note_node(note: &IndexedNote) -> TreeNode {
    TreeNode::Note {
        id: note.metadata.id,
        title: note.metadata.title.clone(),
        rel_path: note.rel_path.clone(),
        is_favorite: note.metadata.is_favorite,
        tags: note.metadata.tags.clone(),
        updated_at: note.metadata.updated_at,
    }
}

#[cfg(windows)]
fn check_note_files_unlocked(metadata: &Path, html: &Path) -> Result<(), AppError> {
    use std::fs::OpenOptions;
    use std::os::windows::fs::OpenOptionsExt;

    // İki dosyanın kilidini dizin veya içerik değiştirilmeden önce denetle.
    let metadata_handle = OpenOptions::new().read(true).write(true)
        .share_mode(0).open(metadata)?;
    let html_handle = OpenOptions::new().read(true).write(true)
        .share_mode(0).open(html)?;
    drop(html_handle);
    drop(metadata_handle);
    Ok(())
}

#[cfg(not(windows))]
fn check_note_files_unlocked(_metadata: &Path, _html: &Path) -> Result<(), AppError> {
    Ok(())
}

pub fn rename_note_in(root: &Path, note: &IndexedNote, new_title: &str) -> Result<(TreeNode, IndexedNote), AppError> {
    rename_note_with_writer(root, note, new_title, |path, metadata, html| {
        write_metadata_atomic(&path.join("metadata.json"), metadata)?;
        write_file_atomic(&path.join("index.html"), html.as_bytes())
    })
}

fn rename_note_with_writer(
    root: &Path,
    note: &IndexedNote,
    new_title: &str,
    write: impl FnOnce(&Path, &super::model::NoteMetadata, &str) -> Result<(), AppError>,
) -> Result<(TreeNode, IndexedNote), AppError> {
    let source = source_dir(root, &note.rel_path)?;
    let metadata_path = source.join("metadata.json");
    let html_path = source.join("index.html");
    check_note_files_unlocked(&metadata_path, &html_path)?;
    let original_meta = fs::read(&metadata_path)?;
    let original_html = fs::read(&html_path)?;
    let mut metadata = read_metadata(&metadata_path)?;
    if metadata.id != note.metadata.id { return Err(AppError::NotFound(note.rel_path.clone())); }
    metadata.title = new_title.trim().to_owned();
    metadata.updated_at = Utc::now();
    let html = String::from_utf8(original_html.clone())
        .map_err(|error| AppError::Internal(error.to_string()))?;
    let updated_html = sync_head(&html, &metadata, source.join("style.css").is_file(), source.join("script.js").is_file());
    let target = destination(source.parent().ok_or_else(|| AppError::InvalidMove(note.rel_path.clone()))?, &source, &metadata.title)?;
    rename_dir(&source, &target)?;
    if let Err(error) = write(&target, &metadata, &updated_html) {
        // Yazma kısmen tamamlandıysa eski baytlar ve dizin adı geri yüklenir.
        let rollback = (|| {
            if fs::read(target.join("metadata.json"))? != original_meta {
                write_file_atomic(&target.join("metadata.json"), &original_meta)?;
            }
            if fs::read(target.join("index.html"))? != original_html {
                write_file_atomic(&target.join("index.html"), &original_html)?;
            }
            rename_dir(&target, &source)
        })();
        if let Err(rollback_error) = rollback {
            return Err(AppError::Io(std::io::Error::other(format!(
                "Rename failed: {error}; rollback failed: {rollback_error}"
            ))));
        }
        return Err(error);
    }
    let updated = IndexedNote { rel_path: relative(root, &target)?, metadata };
    Ok((note_node(&updated), updated))
}

fn folder_node(root: &Path, path: &Path) -> Result<TreeNode, AppError> {
    let mut children = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() || entry.file_type()?.is_symlink()
            || entry.file_name().to_string_lossy().starts_with('.') { continue; }
        let child = entry.path();
        if child.join("metadata.json").is_file() {
            let metadata = read_metadata(&child.join("metadata.json"))?;
            children.push(note_node(&IndexedNote { rel_path: relative(root, &child)?, metadata }));
        } else {
            children.push(folder_node(root, &child)?);
        }
    }
    Ok(TreeNode::Folder {
        name: path.file_name().unwrap_or_default().to_string_lossy().into_owned(),
        rel_path: relative(root, path)?, children,
    })
}

pub fn rename_folder_in(root: &Path, rel: &str, new_name: &str) -> Result<TreeNode, AppError> {
    let source = source_dir(root, rel)?;
    if source.join("metadata.json").is_file() { return Err(AppError::NotAFolder(rel.into())); }
    let target = destination(source.parent().ok_or_else(|| AppError::InvalidMove(rel.into()))?, &source, new_name)?;
    rename_dir(&source, &target)?;
    match folder_node(root, &target) {
        Ok(node) => Ok(node),
        Err(error) => {
            rename_dir(&target, &source)?;
            Err(error)
        }
    }
}

pub fn move_item_in(root: &Path, rel: &str, target_rel: &str) -> Result<String, AppError> {
    let source = source_dir(root, rel)?;
    let target_parent = target_folder(root, target_rel)?;
    if target_parent.starts_with(&source) {
        return Err(AppError::InvalidMove(rel.into()));
    }
    if source.parent() == Some(target_parent.as_path()) { return relative(root, &source); }
    let name = source.file_name().unwrap_or_default().to_string_lossy();
    let target = destination(&target_parent, &source, &name)?;
    rename_dir(&source, &target)?;
    relative(root, &target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::note_index::NoteIndex;
    use crate::notes::create::{create_folder_in, create_note_in};

    #[test]
    fn rename_note_preserves_id_and_updates_title_and_html() {
        let root = tempfile::tempdir().unwrap();
        let (_, note) = create_note_in(root.path(), "", Some("not")).unwrap();
        let original = fs::read_to_string(root.path().join("not/index.html")).unwrap();
        let (node, updated) = rename_note_in(root.path(), &note, "Not").unwrap();
        assert!(matches!(node, TreeNode::Note { id, .. } if id == note.metadata.id));
        assert_eq!(updated.rel_path, "Not");
        assert!(updated.metadata.updated_at >= note.metadata.updated_at);
        let html = fs::read_to_string(root.path().join("Not/index.html")).unwrap();
        assert!(html.contains("<title>Not</title>"));
        assert_eq!(html.split("<body>").nth(1), original.split("<body>").nth(1));
        assert_eq!(read_metadata(&root.path().join("Not/metadata.json")).unwrap().id, note.metadata.id);
        let mut index = NoteIndex::new(root.path().to_path_buf());
        index.upsert(updated);
        assert_eq!(index.resolve(note.metadata.id), Some(root.path().canonicalize().unwrap().join("Not")));
    }

    #[test]
    fn folder_rename_and_moves_handle_collisions_and_descendants() {
        let root = tempfile::tempdir().unwrap();
        create_folder_in(root.path(), "", "a").unwrap();
        create_folder_in(root.path(), "", "ab").unwrap();
        create_folder_in(root.path(), "a", "b").unwrap();
        let (_, note) = create_note_in(root.path(), "a/b", Some("not")).unwrap();
        assert!(matches!(move_item_in(root.path(), "a", "a/b"), Err(AppError::InvalidMove(_))));
        assert!(matches!(move_item_in(root.path(), "a", "a"), Err(AppError::InvalidMove(_))));
        assert!(matches!(move_item_in(root.path(), ".", "a"), Err(AppError::InvalidMove(_))));
        assert!(matches!(rename_folder_in(root.path(), "", "new"), Err(AppError::InvalidMove(_))));
        assert!(matches!(move_item_in(root.path(), "../outside", "a"), Err(AppError::PathOutsideRoot(_))));
        assert!(matches!(move_item_in(root.path(), "ab", "a/b/not"), Err(AppError::NotAFolder(_))));
        assert_eq!(move_item_in(root.path(), "ab", "a").unwrap(), "a/ab");
        assert!(matches!(rename_folder_in(root.path(), "a", "A").unwrap(), TreeNode::Folder { rel_path, .. } if rel_path == "A"));
        assert_eq!(move_item_in(root.path(), "A/b/not", "").unwrap(), "not");
        assert_eq!(move_item_in(root.path(), "not", "A/b").unwrap(), "A/b/not");
        assert_eq!(read_metadata(&root.path().join("A/b/not/metadata.json")).unwrap().id, note.metadata.id);
    }

    #[test]
    fn note_cannot_move_into_its_own_subdirectory() {
        let root = tempfile::tempdir().unwrap();
        create_folder_in(root.path(), "", "other").unwrap();
        let (_, note) = create_note_in(root.path(), "", Some("not")).unwrap();
        fs::create_dir_all(root.path().join("not/assets/custom")).unwrap();

        assert!(matches!(move_item_in(root.path(), "not", "not/assets"), Err(AppError::InvalidMove(_))));
        assert!(matches!(move_item_in(root.path(), "not", "not/assets/custom"), Err(AppError::InvalidMove(_))));
        assert_eq!(move_item_in(root.path(), "not", "other").unwrap(), "other/not");
        assert_eq!(read_metadata(&root.path().join("other/not/metadata.json")).unwrap().id, note.metadata.id);
    }

    #[test]
    fn collisions_use_unique_names() {
        let root = tempfile::tempdir().unwrap();
        let (_, note) = create_note_in(root.path(), "", Some("old")).unwrap();
        create_note_in(root.path(), "", Some("new")).unwrap();
        let (_, updated) = rename_note_in(root.path(), &note, "new").unwrap();
        assert_eq!(updated.rel_path, "new (2)");
        create_folder_in(root.path(), "", "target").unwrap();
        create_folder_in(root.path(), "target", "new (2)").unwrap();
        assert_eq!(move_item_in(root.path(), "new (2)", "target").unwrap(), "target/new (2) (2)");
    }

    #[cfg(windows)]
    #[test]
    fn differently_cased_source_path_is_not_a_collision() {
        let root = tempfile::tempdir().unwrap();
        create_folder_in(root.path(), "", "not").unwrap();
        let node = rename_folder_in(root.path(), "NOT", "Not").unwrap();
        assert!(matches!(node, TreeNode::Folder { rel_path, .. } if rel_path == "Not"));
        assert!(root.path().join("Not").is_dir());
    }

    #[cfg(not(windows))]
    #[test]
    fn case_only_rename_uses_requested_name_without_suffix() {
        let root = tempfile::tempdir().unwrap();
        create_folder_in(root.path(), "", "not").unwrap();
        let node = rename_folder_in(root.path(), "not", "Not").unwrap();
        assert!(matches!(node, TreeNode::Folder { rel_path, .. } if rel_path == "Not"));
        assert!(root.path().join("Not").is_dir());
        assert!(!root.path().join("not").exists());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn differently_cased_sibling_remains_a_collision() {
        let root = tempfile::tempdir().unwrap();
        create_folder_in(root.path(), "", "not").unwrap();
        fs::create_dir(root.path().join("Not")).unwrap();
        let node = rename_folder_in(root.path(), "not", "Not").unwrap();
        assert!(matches!(node, TreeNode::Folder { rel_path, .. } if rel_path == "Not (2)"));
        assert!(root.path().join("Not").is_dir());
        assert!(root.path().join("Not (2)").is_dir());
    }

    #[test]
    fn write_failure_restores_original_directory_and_files() {
        let root = tempfile::tempdir().unwrap();
        let (_, note) = create_note_in(root.path(), "", Some("old")).unwrap();
        let metadata = fs::read(root.path().join("old/metadata.json")).unwrap();
        let html = fs::read(root.path().join("old/index.html")).unwrap();
        let result = rename_note_with_writer(root.path(), &note, "new", |path, updated, _| {
            write_metadata_atomic(&path.join("metadata.json"), updated)?;
            Err(AppError::Io(std::io::Error::other("locked")))
        });
        assert!(matches!(result, Err(AppError::Io(_))));
        assert!(root.path().join("old").is_dir());
        assert!(!root.path().join("new").exists());
        assert_eq!(fs::read(root.path().join("old/metadata.json")).unwrap(), metadata);
        assert_eq!(fs::read(root.path().join("old/index.html")).unwrap(), html);
        let locked = rename_note_with_writer(root.path(), &note, "new", |_, _, _| {
            Err(AppError::Io(std::io::Error::other("locked metadata")))
        });
        assert!(matches!(locked, Err(AppError::Io(_))));
        assert!(root.path().join("old").is_dir());
    }

    #[cfg(windows)]
    #[test]
    fn locked_note_files_fail_before_rename() {
        use std::fs::OpenOptions;
        use std::os::windows::fs::OpenOptionsExt;

        let root = tempfile::tempdir().unwrap();
        let (_, note) = create_note_in(root.path(), "", Some("old")).unwrap();
        let original_metadata = fs::read(root.path().join("old/metadata.json")).unwrap();
        let original_html = fs::read(root.path().join("old/index.html")).unwrap();

        for name in ["metadata.json", "index.html"] {
            let locked = OpenOptions::new().read(true).share_mode(0)
                .open(root.path().join("old").join(name)).unwrap();
            let error = rename_note_in(root.path(), &note, "new").unwrap_err();
            assert_eq!(error.code(), "IO_ERROR");
            assert!(root.path().join("old").is_dir());
            assert!(!root.path().join("new").exists());
            drop(locked);
            assert_eq!(fs::read(root.path().join("old/metadata.json")).unwrap(), original_metadata);
            assert_eq!(fs::read(root.path().join("old/index.html")).unwrap(), original_html);
        }
    }
}
