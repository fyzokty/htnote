use serde::Serialize;

use crate::error::AppError;
use crate::index::scan::{self, TreeNode};
use crate::settings::{self, Settings, SettingsPatch};
use crate::state::AppState;
use tauri::{Manager, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: &'static str,
    platform: &'static str,
}

#[tauri::command]
pub fn app_info() -> Result<AppInfo, AppError> {
    Ok(AppInfo {
        version: crate::app_version(),
        platform: std::env::consts::OS,
    })
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, AppError> {
    let settings = state.settings.lock().map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(settings.clone())
}

#[tauri::command]
pub fn update_settings(patch: SettingsPatch, state: State<'_, AppState>) -> Result<Settings, AppError> {
    let mut settings = state.settings.lock().map_err(|error| AppError::Internal(error.to_string()))?;
    let updated = settings::apply_patch(&settings, patch);
    settings::save_settings_atomic(&state.config_dir, &updated)?;
    *settings = updated.clone();
    Ok(updated)
}

#[tauri::command]
pub fn get_root_dir(state: State<'_, AppState>) -> Result<String, AppError> {
    let root = state.root_dir.read().map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn get_note_tree(app: tauri::AppHandle) -> Result<Vec<TreeNode>, AppError> {
    scan_and_replace(&app.state::<AppState>()).await
}

async fn scan_and_replace(state: &AppState) -> Result<Vec<TreeNode>, AppError> {
    let root = state.root_dir.read().map_err(|error| AppError::Internal(error.to_string()))?.clone();
    let result = tauri::async_runtime::spawn_blocking(move || scan::scan(&root))
        .await.map_err(|error| AppError::Internal(error.to_string()))??;
    let tree = result.tree.clone();
    state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?.replace_all(result);
    Ok(tree)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::model::{write_metadata_atomic, NoteMetadata};

    #[test]
    fn command_scan_replaces_index() {
        let root = tempfile::tempdir().unwrap();
        let note = root.path().join("Not");
        std::fs::create_dir(&note).unwrap();
        let metadata = NoteMetadata::new("Not");
        write_metadata_atomic(&note.join("metadata.json"), &metadata).unwrap();
        let state = AppState::new(root.path().to_path_buf(), Settings::default(), root.path().to_path_buf());
        let tree = tauri::async_runtime::block_on(scan_and_replace(&state)).unwrap();
        assert!(matches!(&tree[..], [TreeNode::Note { id, .. }] if *id == metadata.id));
        assert_eq!(state.note_index.read().unwrap().rel_path(metadata.id), Some("Not"));
        std::fs::remove_dir_all(note).unwrap();
        assert!(tauri::async_runtime::block_on(scan_and_replace(&state)).unwrap().is_empty());
        assert!(state.note_index.read().unwrap().resolve(metadata.id).is_none());
    }
}
