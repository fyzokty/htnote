use std::path::PathBuf;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use std::sync::atomic::{AtomicBool, AtomicU64};

use crate::settings::Settings;
use crate::index::note_index::NoteIndex;
use uuid::Uuid;

#[derive(Clone)]
pub struct PreviewDraft {
    pub rev: u64,
    pub html: String,
    pub css: String,
    pub js: String,
}

pub type PreviewDrafts = Arc<Mutex<HashMap<Uuid, PreviewDraft>>>;

pub struct AppState {
    pub config_dir: PathBuf,
    pub drafts_dir: PathBuf,
    pub settings: Mutex<Settings>,
    pub root_dir: RwLock<PathBuf>,
    pub note_index: Arc<RwLock<NoteIndex>>,
    pub search_index: Arc<RwLock<crate::search::SearchIndex>>,
    pub link_index: Arc<RwLock<crate::links::LinkIndex>>,
    pub search_indexing: Arc<AtomicBool>,
    pub watcher: Mutex<Option<crate::watcher::WatcherManager>>,
    pub note_origin: RwLock<String>,
    pub last_saved_hashes: Mutex<HashMap<Uuid, String>>,
    pub preview_drafts: PreviewDrafts,
    pub preview_revision: AtomicU64,
}

impl AppState {
    #[cfg(test)]
    pub fn new(config_dir: PathBuf, settings: Settings, root_dir: PathBuf) -> Self {
        let drafts_dir = config_dir.join("drafts");
        Self::with_drafts_dir(config_dir, drafts_dir, settings, root_dir)
    }

    pub fn with_drafts_dir(config_dir: PathBuf, drafts_dir: PathBuf, settings: Settings, root_dir: PathBuf) -> Self {
        Self {
            config_dir,
            drafts_dir,
            settings: Mutex::new(settings),
            note_index: Arc::new(RwLock::new(NoteIndex::new(root_dir.clone()))),
            search_index: Arc::new(RwLock::new(crate::search::SearchIndex::default())),
            link_index: Arc::new(RwLock::new(crate::links::LinkIndex::default())),
            search_indexing: Arc::new(AtomicBool::new(false)),
            root_dir: RwLock::new(root_dir),
            watcher: Mutex::new(None),
            note_origin: RwLock::new(String::new()),
            last_saved_hashes: Mutex::new(HashMap::new()),
            preview_drafts: Arc::new(Mutex::new(HashMap::new())),
            preview_revision: AtomicU64::new(0),
        }
    }
}
