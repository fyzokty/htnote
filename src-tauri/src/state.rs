use std::path::PathBuf;
use std::sync::{Mutex, RwLock};

use crate::settings::Settings;

pub struct AppState {
    pub config_dir: PathBuf,
    pub settings: Mutex<Settings>,
    pub root_dir: RwLock<PathBuf>,
}

impl AppState {
    pub fn new(config_dir: PathBuf, settings: Settings, root_dir: PathBuf) -> Self {
        Self {
            config_dir,
            settings: Mutex::new(settings),
            root_dir: RwLock::new(root_dir),
        }
    }
}
