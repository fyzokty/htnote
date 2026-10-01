use std::collections::HashMap;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::error::AppError;

use super::resolve_in_root;
use super::scan::{self, IndexedNote, ScanResult, TreeNode};

pub struct NoteIndex {
    pub root: PathBuf,
    pub by_id: HashMap<Uuid, IndexedNote>,
    pub tree: Vec<TreeNode>,
}

impl NoteIndex {
    pub fn new(root: PathBuf) -> Self {
        Self { root, by_id: HashMap::new(), tree: Vec::new() }
    }

    pub fn resolve(&self, id: Uuid) -> Option<PathBuf> {
        resolve_in_root(&self.root, &self.by_id.get(&id)?.rel_path).ok()
    }

    pub fn rel_path(&self, id: Uuid) -> Option<&str> {
        self.by_id.get(&id).map(|note| note.rel_path.as_str())
    }

    pub fn replace_all(&mut self, scan: ScanResult) {
        self.by_id = scan.notes.into_iter().map(|note| (note.metadata.id, note)).collect();
        self.tree = scan.tree;
    }

    pub fn refresh_readonly(&mut self) -> Result<(), AppError> {
        let result = scan::scan_readonly(&self.root)?;
        self.replace_all(result);
        Ok(())
    }

    pub fn upsert(&mut self, note: IndexedNote) {
        self.by_id.insert(note.metadata.id, note);
    }

    pub fn rename_prefix(&mut self, old_rel: &str, new_rel: &str) {
        for note in self.by_id.values_mut() {
            if let Ok(suffix) = Path::new(&note.rel_path).strip_prefix(old_rel) {
                note.rel_path = super::rel_string(&Path::new(new_rel).join(suffix));
            }
        }
    }

    pub fn remove_subtree(&mut self, rel_path: &str) {
        let prefix = format!("{}/", rel_path.trim_end_matches('/'));
        self.by_id.retain(|_, note| note.rel_path != rel_path && !note.rel_path.starts_with(&prefix));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::create::{create_folder_in, create_note_in};
    use crate::notes::model::NoteMetadata;
    use crate::notes::rename::{move_item_in, rename_folder_in, rename_note_in};

    fn tree_has_path(nodes: &[TreeNode], expected: &str) -> bool {
        nodes.iter().any(|node| match node {
            TreeNode::Folder { rel_path, children, .. } => {
                rel_path == expected || tree_has_path(children, expected)
            }
            TreeNode::Note { rel_path, .. } => rel_path == expected,
        })
    }

    #[test]
    fn index_resolves_and_removes_subtrees() {
        let root = tempfile::tempdir().unwrap();
        let mut index = NoteIndex::new(root.path().to_path_buf());
        let first = NoteMetadata::new("First");
        let second = NoteMetadata::new("Second");
        index.upsert(IndexedNote { rel_path: "A/N1".into(), metadata: first.clone() });
        index.upsert(IndexedNote { rel_path: "AB/N2".into(), metadata: second.clone() });
        assert_eq!(index.rel_path(first.id), Some("A/N1"));
        assert_eq!(index.resolve(first.id), Some(root.path().canonicalize().unwrap().join("A/N1")));
        index.remove_subtree("A");
        assert!(index.resolve(first.id).is_none());
        assert_eq!(index.rel_path(second.id), Some("AB/N2"));
        index.replace_all(ScanResult::default());
        assert!(index.by_id.is_empty());
    }

    #[test]
    fn rename_prefix_updates_only_descendants() {
        let mut index = NoteIndex::new(PathBuf::from("root"));
        let inside = NoteMetadata::new("Inside");
        let outside = NoteMetadata::new("Outside");
        index.upsert(IndexedNote { rel_path: "a/b/note".into(), metadata: inside.clone() });
        index.upsert(IndexedNote { rel_path: "ab/note".into(), metadata: outside.clone() });
        index.rename_prefix("a", "moved/a");
        assert_eq!(index.rel_path(inside.id), Some("moved/a/b/note"));
        assert_eq!(index.rel_path(outside.id), Some("ab/note"));
    }

    #[test]
    fn readonly_refresh_updates_paths_titles_and_tree_after_mutations() {
        let root = tempfile::tempdir().unwrap();
        create_folder_in(root.path(), "", "a").unwrap();
        create_folder_in(root.path(), "", "target").unwrap();
        let (_, note) = create_note_in(root.path(), "a", Some("old")).unwrap();
        let mut index = NoteIndex::new(root.path().to_path_buf());
        index.refresh_readonly().unwrap();

        rename_note_in(root.path(), index.by_id.get(&note.metadata.id).unwrap(), "new").unwrap();
        index.refresh_readonly().unwrap();
        assert_eq!(index.rel_path(note.metadata.id), Some("a/new"));
        assert_eq!(index.by_id[&note.metadata.id].metadata.title, "new");
        assert!(tree_has_path(&index.tree, "a/new"));
        assert!(!tree_has_path(&index.tree, "a/old"));

        rename_folder_in(root.path(), "a", "renamed").unwrap();
        index.refresh_readonly().unwrap();
        assert_eq!(index.rel_path(note.metadata.id), Some("renamed/new"));
        assert!(tree_has_path(&index.tree, "renamed/new"));
        assert!(!tree_has_path(&index.tree, "a"));

        move_item_in(root.path(), "renamed", "target").unwrap();
        index.refresh_readonly().unwrap();
        assert_eq!(index.rel_path(note.metadata.id), Some("target/renamed/new"));
        assert_eq!(index.resolve(note.metadata.id), Some(root.path().canonicalize().unwrap().join("target/renamed/new")));
        assert!(tree_has_path(&index.tree, "target/renamed/new"));
        assert!(!tree_has_path(&index.tree, "renamed"));
    }

    #[test]
    fn failed_mutation_keeps_index_unchanged() {
        let root = tempfile::tempdir().unwrap();
        create_folder_in(root.path(), "", "a").unwrap();
        create_folder_in(root.path(), "a", "b").unwrap();
        let (_, note) = create_note_in(root.path(), "a/b", Some("note")).unwrap();
        let mut index = NoteIndex::new(root.path().to_path_buf());
        index.refresh_readonly().unwrap();
        assert!(move_item_in(root.path(), "a", "a/b").is_err());
        assert_eq!(index.rel_path(note.metadata.id), Some("a/b/note"));
        assert!(tree_has_path(&index.tree, "a/b/note"));
    }

    #[test]
    fn readonly_refresh_after_mutation_tolerates_unrelated_repair_needed_metadata() {
        let root = tempfile::tempdir().unwrap();
        let (_, note) = create_note_in(root.path(), "", Some("old")).unwrap();
        let (_, unrelated) = create_note_in(root.path(), "", Some("other")).unwrap();
        let metadata_path = root.path().join("other/metadata.json");
        let mut value: serde_json::Value = serde_json::from_slice(&std::fs::read(&metadata_path).unwrap()).unwrap();
        value.as_object_mut().unwrap().remove("title");
        let damaged_bytes = serde_json::to_vec(&value).unwrap();
        std::fs::write(&metadata_path, &damaged_bytes).unwrap();

        let mut index = NoteIndex::new(root.path().to_path_buf());
        index.refresh_readonly().unwrap();
        rename_note_in(root.path(), index.by_id.get(&note.metadata.id).unwrap(), "new").unwrap();
        index.refresh_readonly().unwrap();

        assert_eq!(index.rel_path(note.metadata.id), Some("new"));
        assert_eq!(index.resolve(note.metadata.id), Some(root.path().canonicalize().unwrap().join("new")));
        assert_eq!(index.by_id[&note.metadata.id].metadata.title, "new");
        assert!(tree_has_path(&index.tree, "new"));
        assert!(!tree_has_path(&index.tree, "old"));
        assert_eq!(index.rel_path(unrelated.metadata.id), Some("other"));
        assert_eq!(std::fs::read(metadata_path).unwrap(), damaged_bytes);
    }
}
