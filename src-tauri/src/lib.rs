pub mod commands;
mod drafts;
mod external;
mod export;
mod onboarding;
mod protocol;
mod note_server;
pub mod error;
mod fs_util;
pub mod index;
pub mod notes;
pub mod settings;
pub mod search;
pub mod links;
pub mod state;
mod watcher;
mod trash;
#[cfg(any(windows, test))]
mod snap_layouts;
#[cfg(any(all(windows, debug_assertions), test))]
mod webview_debug_args;

mod splash;

use tauri::Manager;

/// Uygulama sürümü; tek kaynak `Cargo.toml`'dur.
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    #[cfg(all(windows, debug_assertions))]
    let browser_arguments = webview_debug_args::BrowserArguments::new(
        &std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default(),
    );
    #[cfg(all(windows, debug_assertions))]
    let context = {
        let mut context = context;
        browser_arguments.apply_to_config(context.config_mut());
        context
    };
    let builder = tauri::Builder::default();
    #[cfg(all(windows, debug_assertions))]
    let builder = builder.manage(browser_arguments);
    builder
        .on_page_load({
            let shown = std::sync::atomic::AtomicBool::new(false);
            move |webview, payload| {
                if webview.label() == "main"
                    && payload.event() == tauri::webview::PageLoadEvent::Finished
                    && !shown.swap(true, std::sync::atomic::Ordering::Relaxed)
                {
                    if let Some(window) = webview.app_handle().get_webview_window("main") {
                        splash::show_if_hidden(&window);
                    }
                }
            }
        })
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_dir = settings::config_dir_override().unwrap_or(app.path().app_config_dir()?);
            let settings = settings::load_settings(&config_dir)?;
            if let Some(window) = app.get_webview_window("main") {
                splash::prepare(window, &settings.theme);
            }
            let documents = dirs::document_dir()
                .or_else(dirs::home_dir)
                .ok_or_else(|| error::AppError::Internal("No documents or home directory".into()))?;
            let root_settings = if let Some(root) = settings::root_override() {
                settings::Settings { root_dir: Some(root.to_string_lossy().into_owned()), ..settings.clone() }
            } else {
                settings.clone()
            };
            let root_dir = settings::resolve_root_dir(&root_settings, &documents)?;
            let drafts_dir = app.path().app_data_dir()?.join("drafts");
            std::fs::create_dir_all(&drafts_dir)?;
            let state = state::AppState::with_drafts_dir(config_dir, drafts_dir, settings, root_dir.clone());
            // Onboarding yalnızca kökün üst düzeyini okur; örnek notlar taramadan önce yazılmalıdır.
            if let Err(error) = onboarding::run(&state) {
                eprintln!("Onboarding failed: {error}");
            }
            let origin = note_server::start(state.note_index.clone(), state.preview_drafts.clone(), state.index_ready.clone())?;
            *state.note_origin.write().map_err(|error| error::AppError::Internal(error.to_string()))? = origin;
            // Arama, ilk tarama ve dizin oluşturma bitene kadar "indeksleniyor" yanıtı verir.
            state.search_indexing.store(true, std::sync::atomic::Ordering::Release);
            app.manage(state);
            // Olay döngüsü setup dönene kadar başlamaz; büyük köklerde ilk pencere boyaması
            // gecikmesin diye tarama arka planda yapılır.
            let handle = app.handle().clone();
            std::thread::Builder::new().name("htnote-initial-scan".into()).spawn(move || {
                let state = handle.state::<state::AppState>();
                run_startup_indexing(&state, |state| watcher::start_for_app(state, handle.clone()));
            })?;
            #[cfg(windows)]
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = snap_layouts::install(&window) {
                    eprintln!("Snap Layouts overlay unavailable: {error}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::get_settings,
            commands::update_settings,
            commands::set_root_dir,
            commands::validate_root_dir,
            commands::get_root_dir,
            commands::get_note_origin,
            commands::get_note_tree,
            commands::search_notes,
            commands::get_backlinks,
            commands::get_broken_links,
            commands::read_note,
            commands::save_note,
            commands::export_single_html,
            commands::export_zip,
            commands::export_pdf,
            commands::update_metadata,
            commands::copy_asset,
            commands::open_note_asset,
            commands::open_external_url,
            commands::reveal_path,
            commands::save_asset_bytes,
            commands::write_draft,
            commands::read_draft,
            commands::delete_draft,
            commands::list_drafts,
            commands::set_preview_draft,
            commands::clear_preview_draft,
            commands::create_note,
            commands::create_folder,
            commands::rename_note,
            commands::rename_folder,
            commands::move_item,
            commands::reveal_in_explorer,
            commands::delete_item,
            commands::list_trash,
            commands::restore_from_trash,
            commands::delete_permanently,
            commands::empty_trash
        ])
        .run(context)
        .expect("error while running tauri application");
}

/// Başlangıç dizinlemesi (arka plan iş parçacığında çalışır). Sıra:
/// 1. Watcher kurulur; ilk tarama bitene kadar olayları uygulamadan biriktirir.
/// 2. Kök taranır ve indeks doldurulur.
/// 3. Arama/link indeksi kurulmaya başlar.
/// 4. İndeks hazır işaretlenir; bekleyen komutlar, not sunucusu ve watcher serbest kalır.
///
/// İzleme taramadan önce kurulduğu için tarama sırasında olan değişiklikler kaybolmaz;
/// watcher bunları dolu indekse karşı uygular, eski tarama sonucu yeni olayların üzerine yazılmaz.
fn run_startup_indexing(state: &state::AppState, start_watcher: impl FnOnce(&state::AppState) -> Result<(), error::AppError>) {
    let _ready = state::MarkReadyOnDrop(&state.index_ready);
    if let Err(error) = start_watcher(state) {
        eprintln!("File watcher startup failed: {error}");
    }
    if let Err(error) = initial_scan(state) {
        // Önceki davranış korunur: indeks boş kalır, uygulama yine açılır.
        eprintln!("Initial note scan failed: {error}");
    }
    search::start_build(state);
}

fn initial_scan(state: &state::AppState) -> Result<(), error::AppError> {
    // Tarama sırasında kilit tutulmaz; senkron komutlar (ör. get_root_dir) ana iş parçacığını bloklamamalı.
    let root = state.root_dir.read().map_err(|error| error::AppError::Internal(error.to_string()))?.clone();
    let result = index::scan::scan(&root)?;
    let live_root = state.root_dir.read().map_err(|error| error::AppError::Internal(error.to_string()))?;
    // Kök değiştirme hazır olmadan reddedilir; yine de eski kökün sonucu yeni kökün yerine yazılmaz.
    if *live_root != root { return Ok(()); }
    state.note_index.write().map_err(|error| error::AppError::Internal(error.to_string()))?.replace_all(result);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::model::{write_metadata_atomic, NoteMetadata};

    /// `tauri.conf.json` ile `Cargo.toml` sürümleri ayrışırsa paketler yanlış sürümle çıkar.
    #[test]
    fn tauri_conf_version_matches_cargo_version() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("geçerli JSON");
        if conf["version"] == "../package.json" {
            let package: serde_json::Value =
                serde_json::from_str(include_str!("../../package.json")).expect("geçerli package JSON");
            assert_eq!(package["version"].as_str(), Some(app_version()));
        } else {
            assert_eq!(conf["version"].as_str(), Some(app_version()));
        }
    }

    /// Not origin'i capability kapsamına girmemeli; iframe ve IPC kaynakları açıkça sınırlanmalı.
    #[test]
    fn main_capability_and_csp_are_isolated() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/main.json")).expect("geçerli capability JSON");
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("geçerli Tauri JSON");

        assert!(capability.get("remote").is_none());
        assert_eq!(capability["windows"], serde_json::json!(["main"]));
        let permissions = capability["permissions"].as_array().expect("izin listesi");
        for permission in permissions {
            let identifier = permission.as_str().or_else(|| permission["identifier"].as_str()).expect("izin kimliği");
            assert!(!identifier.contains('*'), "joker izin: {identifier}");
            assert!(!identifier.starts_with("opener:"), "direct opener permission: {identifier}");
        }
        let dialog_permissions: Vec<_> = permissions.iter()
            .filter_map(|permission| permission.as_str().or_else(|| permission["identifier"].as_str()))
            .filter(|identifier| identifier.starts_with("dialog:")).collect();
        assert_eq!(dialog_permissions, ["dialog:allow-open", "dialog:allow-save"]);

        let csp = conf["app"]["security"]["csp"].as_str().expect("üretim CSP");
        let directives: std::collections::HashMap<_, _> = csp
            .split(';')
            .map(|directive| {
                let (name, value) = directive.trim().split_once(' ').expect("CSP direktifi");
                (name, value)
            })
            .collect();
        assert_eq!(directives.get("frame-src"), Some(&"http://127.0.0.1:*"));
        assert_eq!(directives.get("connect-src"), Some(&"ipc: http://ipc.localhost"));
        assert_eq!(directives.get("script-src"), Some(&"'self'"));
        assert!(!csp.contains("'unsafe-eval'"));
        assert!(!csp.contains("script-src 'self' 'unsafe-inline'"));
    }

    /// Özel başlık çubuğu yalnızca gereken pencere izinlerini alır; macOS trafik ışıklarını korur.
    #[test]
    fn custom_title_bar_uses_narrow_window_permissions() {
        let capability: serde_json::Value = serde_json::from_str(include_str!("../capabilities/main.json")).unwrap();
        let mut window_permissions: Vec<_> = capability["permissions"].as_array().unwrap().iter()
            .filter_map(|permission| permission.as_str())
            .filter(|identifier| identifier.starts_with("core:window:"))
            .collect();
        window_permissions.sort_unstable();
        assert_eq!(window_permissions, [
            "core:window:allow-close",
            "core:window:allow-destroy",
            "core:window:allow-minimize",
            "core:window:allow-start-dragging",
            "core:window:allow-toggle-maximize",
        ]);

        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let main = &conf["app"]["windows"][0];
        assert_eq!(main["label"], "main");
        assert_eq!(main["decorations"], false);
        assert_eq!(main["shadow"], true);
        assert_eq!((main["minWidth"].as_u64(), main["minHeight"].as_u64()), (Some(900), Some(600)));

        let mac: serde_json::Value = serde_json::from_str(include_str!("../tauri.macos.conf.json")).unwrap();
        let mac_main = &mac["app"]["windows"][0];
        assert_eq!(mac_main["label"], "main");
        assert_eq!(mac_main["decorations"], true);
        assert_eq!(mac_main["titleBarStyle"], "Overlay");
        assert_eq!(mac_main["hiddenTitle"], true);
        assert_eq!((mac_main["minWidth"].as_u64(), mac_main["minHeight"].as_u64()), (Some(900), Some(600)));
    }

    #[test]
    fn pdf_capability_grants_no_permissions() {
        let capability: serde_json::Value = serde_json::from_str(include_str!("../capabilities/pdf-export.json")).unwrap();
        assert_eq!(capability["windows"], serde_json::json!(["pdf-export-*"]));
        assert_eq!(capability["permissions"], serde_json::json!([]));
        assert!(capability.get("remote").is_none());
    }

    fn startup_state(root: &std::path::Path) -> (state::AppState, uuid::Uuid) {
        let note = root.join("Not");
        std::fs::create_dir_all(&note).unwrap();
        let metadata = NoteMetadata::new("Not");
        write_metadata_atomic(&note.join("metadata.json"), &metadata).unwrap();
        // Üretim kurucusu: indeks başlangıç dizinlemesi bitene kadar hazır değildir.
        let state = state::AppState::with_drafts_dir(root.join(".config"), root.join(".drafts"),
            settings::Settings::default(), root.to_path_buf());
        (state, metadata.id)
    }

    #[test]
    fn startup_indexing_starts_watcher_before_scan_and_marks_ready_last() {
        let root = tempfile::tempdir().unwrap();
        let (state, id) = startup_state(root.path());
        assert!(!state.index_ready.is_ready());
        let mut seen_by_watcher = None;
        run_startup_indexing(&state, |state| {
            seen_by_watcher = Some((state.index_ready.is_ready(), state.note_index.read().unwrap().by_id.len()));
            Ok(())
        });
        // Watcher boş ve hazır olmayan indeksle kurulur; olaylarını taramadan sonra uygular.
        assert_eq!(seen_by_watcher, Some((false, 0)));
        assert!(state.index_ready.is_ready());
        assert_eq!(state.note_index.read().unwrap().rel_path(id), Some("Not"));
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while state.search_indexing.load(std::sync::atomic::Ordering::Acquire) {
            assert!(std::time::Instant::now() < deadline, "search build timeout");
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        assert_eq!(state.search_index.read().unwrap().search("Not", 10)[0].id, id);
    }

    #[test]
    fn waiting_consumers_see_a_populated_index_once_ready() {
        let root = tempfile::tempdir().unwrap();
        let (state, id) = startup_state(root.path());
        std::thread::scope(|scope| {
            let waiter = scope.spawn(|| {
                let waited = state.index_ready.wait();
                (waited, state.note_index.read().unwrap().rel_path(id).map(str::to_owned))
            });
            std::thread::sleep(std::time::Duration::from_millis(50));
            run_startup_indexing(&state, |_| Ok(()));
            assert_eq!(waiter.join().unwrap(), (true, Some("Not".to_owned())));
        });
        assert!(!state.index_ready.wait());
    }

    #[test]
    fn startup_indexing_marks_ready_even_after_failures() {
        let root = tempfile::tempdir().unwrap();
        let (state, id) = startup_state(root.path());
        run_startup_indexing(&state, |_| Err(error::AppError::Internal("watcher failed".into())));
        assert!(state.index_ready.is_ready());
        assert_eq!(state.note_index.read().unwrap().rel_path(id), Some("Not"));

        let (panicking, _) = startup_state(&root.path().join("second"));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            run_startup_indexing(&panicking, |_| panic!("watcher panicked"));
        }));
        assert!(result.is_err());
        // Bekleyen komutlar asılı kalmaz; indeks önceki hata davranışındaki gibi boş kalır.
        assert!(panicking.index_ready.is_ready());
        assert!(panicking.note_index.read().unwrap().by_id.is_empty());
    }
}
