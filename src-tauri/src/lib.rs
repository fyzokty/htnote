mod commands;
mod drafts;
mod onboarding;
mod protocol;
mod note_server;
pub mod error;
mod fs_util;
pub mod index;
pub mod notes;
mod settings;
mod state;
mod watcher;

use tauri::Manager;

/// Uygulama sürümü; tek kaynak `Cargo.toml`'dur.
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
            if let Err(error) = watcher::start_for_app(&managed, app.handle().clone()) {
                eprintln!("File watcher startup failed: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::get_settings,
            commands::update_settings,
            commands::get_root_dir,
            commands::get_note_origin,
            commands::get_note_tree,
            commands::read_note,
            commands::save_note,
            commands::copy_asset,
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
            commands::reveal_in_explorer
        ])
        .run(tauri::generate_context!())
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

    /// `tauri.conf.json` ile `Cargo.toml` sürümleri ayrışırsa paketler yanlış sürümle çıkar.
    #[test]
    fn tauri_conf_version_matches_cargo_version() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("geçerli JSON");
        assert_eq!(conf["version"].as_str(), Some(app_version()));
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
        }

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
