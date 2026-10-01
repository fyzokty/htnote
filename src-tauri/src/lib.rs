mod commands;
pub mod error;
mod fs_util;
pub mod index;
pub mod notes;
mod settings;
mod state;

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
            let config_dir = app.path().app_config_dir()?;
            let settings = settings::load_settings(&config_dir)?;
            let documents = dirs::document_dir()
                .or_else(dirs::home_dir)
                .ok_or_else(|| error::AppError::Internal("No documents or home directory".into()))?;
            let root_dir = settings::resolve_root_dir(&settings, &documents)?;
            let state = state::AppState::new(config_dir, settings, root_dir.clone());
            if let Err(error) = initial_scan(&state) {
                eprintln!("Initial note scan failed: {error}");
            }
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::get_settings,
            commands::update_settings,
            commands::get_root_dir,
            commands::get_note_tree,
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
