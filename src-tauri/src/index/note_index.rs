use std::collections::HashMap;
use std::path::PathBuf;

use uuid::Uuid;

use super::resolve_in_root;
use super::scan::{IndexedNote, ScanResult, TreeNode};

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

    pub fn upsert(&mut self, note: IndexedNote) {
        self.by_id.insert(note.metadata.id, note);
    }

    pub fn remove_subtree(&mut self, rel_path: &str) {
        let prefix = format!("{}/", rel_path.trim_end_matches('/'));
        self.by_id.retain(|_, note| note.rel_path != rel_path && !note.rel_path.starts_with(&prefix));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::model::NoteMetadata;

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
}
