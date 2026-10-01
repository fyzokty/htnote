use std::path::PathBuf;
use std::sync::{Mutex, RwLock};

use crate::settings::Settings;
use crate::index::note_index::NoteIndex;

pub struct AppState {
    pub config_dir: PathBuf,
    pub settings: Mutex<Settings>,
    pub root_dir: RwLock<PathBuf>,
    pub note_index: RwLock<NoteIndex>,
}

impl AppState {
    pub fn new(config_dir: PathBuf, settings: Settings, root_dir: PathBuf) -> Self {
        Self {
            config_dir,
            settings: Mutex::new(settings),
            note_index: RwLock::new(NoteIndex::new(root_dir.clone())),
            root_dir: RwLock::new(root_dir),
        }
    }
}
