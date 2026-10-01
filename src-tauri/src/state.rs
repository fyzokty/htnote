use std::path::PathBuf;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use crate::settings::Settings;
use crate::index::note_index::NoteIndex;
use uuid::Uuid;

pub struct AppState {
    pub config_dir: PathBuf,
    pub settings: Mutex<Settings>,
    pub root_dir: RwLock<PathBuf>,
    pub note_index: Arc<RwLock<NoteIndex>>,
    pub watcher: Mutex<Option<crate::watcher::WatcherManager>>,
    pub note_origin: RwLock<String>,
    pub last_saved_hashes: Mutex<HashMap<Uuid, String>>,
}

impl AppState {
    pub fn new(config_dir: PathBuf, settings: Settings, root_dir: PathBuf) -> Self {
        Self {
            config_dir,
            settings: Mutex::new(settings),
            note_index: Arc::new(RwLock::new(NoteIndex::new(root_dir.clone()))),
            root_dir: RwLock::new(root_dir),
            watcher: Mutex::new(None),
            note_origin: RwLock::new(String::new()),
            last_saved_hashes: Mutex::new(HashMap::new()),
        }
    }
}
