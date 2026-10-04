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

use tauri::Manager;

/// Uygulama sÃ¼rÃ¼mÃ¼; tek kaynak `Cargo.toml`'dur.
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
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_dir = settings::config_dir_override().unwrap_or(app.path().app_config_dir()?);
            let settings = settings::load_settings(&config_dir)?;
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
            if let Err(error) = onboarding::run(&state) {
                eprintln!("Onboarding failed: {error}");
            }
            if let Err(error) = initial_scan(&state) {
                eprintln!("Initial note scan failed: {error}");
            }
            let origin = note_server::start(state.note_index.clone(), state.preview_drafts.clone())?;
            *state.note_origin.write().map_err(|error| error::AppError::Internal(error.to_string()))? = origin;
            app.manage(state);
            let managed = app.state::<state::AppState>();
            search::start_build(&managed);
            if let Err(error) = watcher::start_for_app(&managed, app.handle().clone()) {
                eprintln!("File watcher startup failed: {error}");
            }
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

fn initial_scan(state: &state::AppState) -> Result<(), error::AppError> {
    let root = state.root_dir.read().map_err(|error| error::AppError::Internal(error.to_string()))?;
    let result = index::scan::scan(&root)?;
    state.note_index.write().map_err(|error| error::AppError::Internal(error.to_string()))?.replace_all(result);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::model::{write_metadata_atomic, NoteMetadata};

    /// `tauri.conf.json` ile `Cargo.toml` sÃ¼rÃ¼mleri ayrÄ±ÅŸÄ±rsa paketler yanlÄ±ÅŸ sÃ¼rÃ¼mle Ã§Ä±kar.
    #[test]
    fn tauri_conf_version_matches_cargo_version() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("geÃ§erli JSON");
        if conf["version"] == "../package.json" {
            let package: serde_json::Value =
                serde_json::from_str(include_str!("../../package.json")).expect("geÃ§erli package JSON");
            assert_eq!(package["version"].as_str(), Some(app_version()));
        } else {
            assert_eq!(conf["version"].as_str(), Some(app_version()));
        }
    }

    /// Not origin'i capability kapsamÄ±na girmemeli; iframe ve IPC kaynaklarÄ± aÃ§Ä±kÃ§a sÄ±nÄ±rlanmalÄ±.
    #[test]
    fn main_capability_and_csp_are_isolated() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/main.json")).expect("geÃ§erli capability JSON");
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("geÃ§erli Tauri JSON");

        assert!(capability.get("remote").is_none());
        assert_eq!(capability["windows"], serde_json::json!(["main"]));
        let permissions = capability["permissions"].as_array().expect("izin listesi");
        for permission in permissions {
            let identifier = permission.as_str().or_else(|| permission["identifier"].as_str()).expect("izin kimliÄŸi");
            assert!(!identifier.contains('*'), "joker izin: {identifier}");
            assert!(!identifier.starts_with("opener:"), "direct opener permission: {identifier}");
        }
        let dialog_permissions: Vec<_> = permissions.iter()
            .filter_map(|permission| permission.as_str().or_else(|| permission["identifier"].as_str()))
            .filter(|identifier| identifier.starts_with("dialog:")).collect();
        assert_eq!(dialog_permissions, ["dialog:allow-open", "dialog:allow-save"]);

        let csp = conf["app"]["security"]["csp"].as_str().expect("Ã¼retim CSP");
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

    #[test]
    fn startup_populates_note_index() {
        let root = tempfile::tempdir().unwrap();
        let note = root.path().join("Not");
        std::fs::create_dir(&note).unwrap();
        let metadata = NoteMetadata::new("Not");
        write_metadata_atomic(&note.join("metadata.json"), &metadata).unwrap();
        let state = state::AppState::new(root.path().to_path_buf(), settings::Settings::default(), root.path().to_path_buf());
        initial_scan(&state).unwrap();
        assert_eq!(state.note_index.read().unwrap().rel_path(metadata.id), Some("Not"));
    }
}
