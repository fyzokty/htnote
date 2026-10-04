use std::path::PathBuf;
use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex, RwLock};
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

/// İlk not taramasının bitip bitmediğini tutar. Hazır olma bir kez ayarlanır ve geri alınmaz;
/// taramaya bağlı komutlar, not sunucusu ve watcher indeks dolmadan iş yapmaz.
pub struct IndexReady {
    ready: Mutex<bool>,
    changed: Condvar,
}

impl IndexReady {
    pub fn new(ready: bool) -> Self {
        Self { ready: Mutex::new(ready), changed: Condvar::new() }
    }

    pub fn is_ready(&self) -> bool {
        *self.ready.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn mark_ready(&self) {
        // Zehirli kilitte de bekleyenler serbest kalmalı; aksi halde komutlar sonsuza dek bekler.
        let mut ready = self.ready.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        *ready = true;
        self.changed.notify_all();
    }

    /// Hazır olana kadar bloklar; beklemek gerektiyse `true` döner.
    /// Ana iş parçacığında çağrılmamalı; Tauri senkron komutları ana iş parçacığında çalışabilir.
    pub fn wait(&self) -> bool {
        let mut ready = self.ready.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if *ready { return false; }
        while !*ready {
            ready = self.changed.wait(ready).unwrap_or_else(|poisoned| poisoned.into_inner());
        }
        true
    }
}

/// Panik veya erken dönüşte de hazır işaretini koyar; bekleyen komutlar asılı kalmaz.
pub struct MarkReadyOnDrop<'a>(pub &'a IndexReady);

impl Drop for MarkReadyOnDrop<'_> {
    fn drop(&mut self) { self.0.mark_ready(); }
}

pub struct AppState {
    pub config_dir: PathBuf,
    pub drafts_dir: PathBuf,
    pub settings: Mutex<Settings>,
    pub root_dir: RwLock<PathBuf>,
    pub note_index: Arc<RwLock<NoteIndex>>,
    pub search_index: Arc<RwLock<crate::search::SearchIndex>>,
    pub link_index: Arc<RwLock<crate::links::LinkIndex>>,
    pub search_indexing: Arc<AtomicBool>,
    pub index_ready: Arc<IndexReady>,
    pub watcher: Mutex<Option<crate::watcher::WatcherManager>>,
    pub note_origin: RwLock<String>,
    pub last_saved_hashes: Mutex<HashMap<Uuid, String>>,
    pub preview_drafts: PreviewDrafts,
    pub preview_revision: AtomicU64,
}

impl AppState {
    /// Birim testleri indeksi elle doldurur; bu yüzden indeks hazır sayılır.
    #[cfg(test)]
    pub fn new(config_dir: PathBuf, settings: Settings, root_dir: PathBuf) -> Self {
        let drafts_dir = config_dir.join("drafts");
        let state = Self::with_drafts_dir(config_dir, drafts_dir, settings, root_dir);
        state.index_ready.mark_ready();
        state
    }

    /// İndeks, başlangıç dizinlemesi bitene kadar hazır değildir (bkz. `lib.rs`).
    pub fn with_drafts_dir(config_dir: PathBuf, drafts_dir: PathBuf, settings: Settings, root_dir: PathBuf) -> Self {
        Self {
            config_dir,
            drafts_dir,
            settings: Mutex::new(settings),
            note_index: Arc::new(RwLock::new(NoteIndex::new(root_dir.clone()))),
            search_index: Arc::new(RwLock::new(crate::search::SearchIndex::default())),
            link_index: Arc::new(RwLock::new(crate::links::LinkIndex::default())),
            search_indexing: Arc::new(AtomicBool::new(false)),
            index_ready: Arc::new(IndexReady::new(false)),
            root_dir: RwLock::new(root_dir),
            watcher: Mutex::new(None),
            note_origin: RwLock::new(String::new()),
            last_saved_hashes: Mutex::new(HashMap::new()),
            preview_drafts: Arc::new(Mutex::new(HashMap::new())),
            preview_revision: AtomicU64::new(0),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn index_ready_releases_all_waiters_once() {
        let ready = Arc::new(IndexReady::new(false));
        let waiters: Vec<_> = (0..3).map(|_| {
            let ready = Arc::clone(&ready);
            std::thread::spawn(move || ready.wait())
        }).collect();
        std::thread::sleep(Duration::from_millis(50));
        assert!(!ready.is_ready());
        ready.mark_ready();
        for waiter in waiters { assert!(waiter.join().unwrap()); }
        // Hazır olduktan sonra bekleme anında döner ve beklemediğini bildirir.
        assert!(!ready.wait());
        assert!(IndexReady::new(true).is_ready());
    }

    #[test]
    fn mark_ready_guard_runs_on_panic() {
        let ready = IndexReady::new(false);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = MarkReadyOnDrop(&ready);
            panic!("scan panicked");
        }));
        assert!(result.is_err());
        assert!(ready.is_ready());
    }
}
