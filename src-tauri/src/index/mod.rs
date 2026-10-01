pub mod note_index;
pub mod scan;

use std::path::{Component, Path, PathBuf};

use crate::error::AppError;

pub fn resolve_in_root(root: &Path, rel: &str) -> Result<PathBuf, AppError> {
    let relative = Path::new(rel);
    if relative.is_absolute()
        || relative.components().any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
        || rel.split(['/', '\\']).any(|part| part == "..")
        || rel.contains(':')
        || rel.starts_with('\\')
    {
        return Err(AppError::PathOutsideRoot(rel.into()));
    }
    let root = root.canonicalize()?;
    let candidate = root.join(relative);
    let mut ancestor = candidate.as_path();
    while !ancestor.exists() {
        ancestor = ancestor.parent().ok_or_else(|| AppError::PathOutsideRoot(rel.into()))?;
    }
    let canonical = ancestor.canonicalize()?;
    if !canonical.starts_with(&root) {
        return Err(AppError::PathOutsideRoot(rel.into()));
    }
    Ok(candidate)
}

pub(crate) fn rel_string(path: &Path) -> String {
    path.components().map(|part| part.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_stay_in_root() {
        let root = tempfile::tempdir().unwrap();
        assert!(resolve_in_root(root.path(), "../x").is_err());
        assert!(resolve_in_root(root.path(), "..\\x").is_err());
        assert!(resolve_in_root(root.path(), "/tmp/x").is_err());
        assert!(resolve_in_root(root.path(), "C:\\x").is_err());
        assert_eq!(resolve_in_root(root.path(), "folder/note").unwrap(), root.path().canonicalize().unwrap().join("folder/note"));
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escape_is_rejected() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join("escape")).unwrap();
        assert!(resolve_in_root(root.path(), "escape/note").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn symlink_escape_is_rejected_when_permitted() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        if std::os::windows::fs::symlink_dir(outside.path(), root.path().join("escape")).is_ok() {
            assert!(resolve_in_root(root.path(), "escape/note").is_err());
        }
    }
}
