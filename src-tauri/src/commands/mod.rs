use serde::Serialize;

use crate::error::AppError;
use crate::settings::{self, Settings, SettingsPatch};
use crate::state::AppState;
use tauri::State;

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
