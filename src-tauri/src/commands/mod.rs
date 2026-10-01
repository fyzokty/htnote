use serde::Serialize;

use crate::error::AppError;
use crate::index::scan::{self, TreeNode};
use crate::notes::create;
use crate::notes::read::{self, NoteData};
use crate::notes::rename;
use crate::notes::save::{self, SaveNoteInput, SaveNoteOutput};
use crate::index::scan::IndexedNote;
use crate::settings::{self, Settings, SettingsPatch};
use crate::state::AppState;
use tauri::{Manager, State};
use std::sync::atomic::Ordering;

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
pub fn update_settings(patch: SettingsPatch, app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Settings, AppError> {
    let mut settings = state.settings.lock().map_err(|error| AppError::Internal(error.to_string()))?;
    let updated = settings::apply_patch(&settings, patch);
    let root_changed = updated.root_dir != settings.root_dir;
    let new_root = if root_changed {
        let fallback = dirs::document_dir().or_else(dirs::home_dir)
            .ok_or_else(|| AppError::Internal("No documents or home directory".into()))?;
        Some(settings::resolve_root_dir(&updated, &fallback)?)
    } else { None };
    let result = if let Some(root) = &new_root { Some(scan::scan(root)?) } else { None };
    settings::save_settings_atomic(&state.config_dir, &updated)?;
    *settings = updated.clone();
    drop(settings);
    if let (Some(root), Some(result)) = (new_root, result) {
        *state.watcher.lock().map_err(|error| AppError::Internal(error.to_string()))? = None;
        *state.root_dir.write().map_err(|error| AppError::Internal(error.to_string()))? = root.clone();
        let mut index = state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?;
        index.root = root;
        index.replace_all(result);
        drop(index);
        crate::watcher::start_for_app(&state, app)?;
    }
    Ok(updated)
}

#[tauri::command]
pub fn get_root_dir(state: State<'_, AppState>) -> Result<String, AppError> {
    let root = state.root_dir.read().map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn get_note_origin(state: State<'_, AppState>) -> Result<String, AppError> {
    Ok(state.note_origin.read().map_err(|error| AppError::Internal(error.to_string()))?.clone())
}

#[tauri::command]
pub async fn get_note_tree(app: tauri::AppHandle) -> Result<Vec<TreeNode>, AppError> {
    scan_and_replace(&app.state::<AppState>()).await
}

#[tauri::command]
pub async fn read_note(app: tauri::AppHandle, id: uuid::Uuid) -> Result<NoteData, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let dir = resolve_note_dir(&state, id)?;
        read::read_note_dir(&dir)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn save_note(app: tauri::AppHandle, id: uuid::Uuid, payload: SaveNoteInput) -> Result<SaveNoteOutput, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        save_note_in_state(&state, id, payload, |dir, input| save::save_note_dir(dir, input, chrono::Utc::now()))
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

fn save_note_in_state(
    state: &AppState,
    id: uuid::Uuid,
    payload: SaveNoteInput,
    save: impl FnOnce(&std::path::Path, SaveNoteInput) -> Result<SaveNoteOutput, AppError>,
) -> Result<SaveNoteOutput, AppError> {
    let mut index = state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?;
    let indexed = index.by_id.get(&id).cloned().ok_or_else(|| AppError::NotFound(id.to_string()))?;
    let dir = index.resolve(id).ok_or_else(|| AppError::NotFound(id.to_string()))?;
    let result = save(&dir, payload)?;
    index.upsert(IndexedNote { rel_path: indexed.rel_path, metadata: result.metadata.clone() });
    state.last_saved_hashes.lock().map_err(|error| AppError::Internal(error.to_string()))?
        .insert(id, result.content_hash.clone());
    Ok(result)
}

fn resolve_note_dir(state: &AppState, id: uuid::Uuid) -> Result<std::path::PathBuf, AppError> {
    state.note_index.read()
        .map_err(|error| AppError::Internal(error.to_string()))?
        .resolve(id)
        .ok_or_else(|| AppError::NotFound(id.to_string()))
}

fn set_draft(state: &AppState, id: uuid::Uuid, html: String, css: String, js: String) -> Result<u64, AppError> {
    resolve_note_dir(state, id)?;
    let mut drafts = state.preview_drafts.lock().map_err(|error| AppError::Internal(error.to_string()))?;
    let rev = state.preview_revision.fetch_add(1, Ordering::Relaxed) + 1;
    drafts.insert(id, crate::state::PreviewDraft { rev, html, css, js });
    Ok(rev)
}

#[tauri::command]
pub fn set_preview_draft(state: State<'_, AppState>, id: uuid::Uuid, html: String, css: String, js: String) -> Result<u64, AppError> {
    set_draft(&state, id, html, css, js)
}

#[tauri::command]
pub fn clear_preview_draft(state: State<'_, AppState>, id: uuid::Uuid) -> Result<(), AppError> {
    state.preview_drafts.lock().map_err(|error| AppError::Internal(error.to_string()))?.remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn create_note(app: tauri::AppHandle, parent_rel_path: String, title: Option<String>) -> Result<TreeNode, AppError> {
    let state = app.state::<AppState>();
    let root = state.root_dir.read().map_err(|error| AppError::Internal(error.to_string()))?.clone();
    let (node, indexed) = tauri::async_runtime::spawn_blocking(move || {
        create::create_note_in(&root, &parent_rel_path, title.as_deref())
    }).await.map_err(|error| AppError::Internal(error.to_string()))??;
    state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?.upsert(indexed);
    Ok(node)
}

#[tauri::command]
pub async fn create_folder(app: tauri::AppHandle, parent_rel_path: String, name: String) -> Result<TreeNode, AppError> {
    let root = app.state::<AppState>().root_dir.read()
        .map_err(|error| AppError::Internal(error.to_string()))?.clone();
    tauri::async_runtime::spawn_blocking(move || create::create_folder_in(&root, &parent_rel_path, &name))
        .await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn rename_note(app: tauri::AppHandle, id: uuid::Uuid, new_title: String) -> Result<TreeNode, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut index = state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?;
        let note = index.by_id.get(&id).cloned().ok_or_else(|| AppError::NotFound(id.to_string()))?;
        let (node, _) = rename::rename_note_in(&index.root, &note, &new_title)?;
        index.refresh_readonly()?;
        Ok(node)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn rename_folder(app: tauri::AppHandle, rel_path: String, new_name: String) -> Result<TreeNode, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut index = state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?;
        let node = rename::rename_folder_in(&index.root, &rel_path, &new_name)?;
        index.refresh_readonly()?;
        Ok(node)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn move_item(app: tauri::AppHandle, rel_path: String, target_folder_rel_path: String) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut index = state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?;
        let new_rel = rename::move_item_in(&index.root, &rel_path, &target_folder_rel_path)?;
        index.refresh_readonly()?;
        Ok(new_rel)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn reveal_in_explorer(app: tauri::AppHandle, rel_path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let root = state.root_dir.read().map_err(|error| AppError::Internal(error.to_string()))?;
        let path = crate::index::resolve_in_root(&root, &rel_path)?;
        if !path.exists() { return Err(AppError::NotFound(rel_path)); }
        tauri_plugin_opener::reveal_item_in_dir(&path)
            .map_err(|error| AppError::Io(std::io::Error::other(error)))
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
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
    use crate::notes::create::create_note_in;
    use crate::notes::model::{write_metadata_atomic, NoteMetadata};
    use crate::notes::read::read_note_dir;

    fn save_input(expected_hash: Option<String>) -> SaveNoteInput {
        SaveNoteInput {
            html: "<main>Yeni içerik</main>".into(),
            css: "body {}".into(),
            js: String::new(),
            expected_hash,
        }
    }

    #[test]
    fn save_updates_index_and_last_saved_hash_without_changing_path_or_title() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("folder")).unwrap();
        let (_, indexed) = create_note_in(root.path(), "folder", Some("Başlık")).unwrap();
        let id = indexed.metadata.id;
        let original_path = indexed.rel_path.clone();
        let original_updated_at = indexed.metadata.updated_at;
        let state = AppState::new(root.path().to_path_buf(), Settings::default(), root.path().to_path_buf());
        state.note_index.write().unwrap().upsert(indexed);
        let dir = resolve_note_dir(&state, id).unwrap();
        let expected_hash = read_note_dir(&dir).unwrap().content_hash;

        let saved = save_note_in_state(&state, id, save_input(Some(expected_hash)), |dir, input| {
            save::save_note_dir(dir, input, original_updated_at + chrono::Duration::seconds(1))
        }).unwrap();

        let index = state.note_index.read().unwrap();
        assert_eq!(index.rel_path(id), Some(original_path.as_str()));
        assert_eq!(index.by_id[&id].metadata.title, "Başlık");
        assert_eq!(index.by_id[&id].metadata.updated_at, saved.metadata.updated_at);
        assert!(index.by_id[&id].metadata.has_custom_css);
        assert_eq!(saved.content_hash, read_note_dir(&dir).unwrap().content_hash);
        assert_eq!(state.last_saved_hashes.lock().unwrap().get(&id), Some(&saved.content_hash));
    }

    #[test]
    fn conflict_and_write_failure_keep_index_and_last_saved_hash() {
        let root = tempfile::tempdir().unwrap();
        let (_, indexed) = create_note_in(root.path(), "", Some("Başlık")).unwrap();
        let id = indexed.metadata.id;
        let original_updated_at = indexed.metadata.updated_at;
        let original_path = indexed.rel_path.clone();
        let state = AppState::new(root.path().to_path_buf(), Settings::default(), root.path().to_path_buf());
        state.note_index.write().unwrap().upsert(indexed);
        state.last_saved_hashes.lock().unwrap().insert(id, "previous".into());
        let dir = resolve_note_dir(&state, id).unwrap();
        let original_hash = read_note_dir(&dir).unwrap().content_hash;

        let conflict = save_note_in_state(&state, id, save_input(Some("stale".into())), |dir, input| {
            save::save_note_dir(dir, input, chrono::Utc::now())
        });
        assert!(matches!(conflict, Err(AppError::Conflict(_))));

        let write_failure = save_note_in_state(&state, id, save_input(Some(original_hash.clone())), |_, _| {
            Err(AppError::Io(std::io::Error::other("injected write failure")))
        });
        assert!(matches!(write_failure, Err(AppError::Io(_))));

        let index = state.note_index.read().unwrap();
        assert_eq!(index.rel_path(id), Some(original_path.as_str()));
        assert_eq!(index.by_id[&id].metadata.title, "Başlık");
        assert_eq!(index.by_id[&id].metadata.updated_at, original_updated_at);
        assert!(!index.by_id[&id].metadata.has_custom_css);
        assert_eq!(state.last_saved_hashes.lock().unwrap().get(&id).map(String::as_str), Some("previous"));
        assert_eq!(read_note_dir(&dir).unwrap().content_hash, original_hash);
    }

    #[test]
    fn unknown_note_id_is_not_found() {
        let root = tempfile::tempdir().unwrap();
        let state = AppState::new(root.path().to_path_buf(), Settings::default(), root.path().to_path_buf());
        let id = uuid::Uuid::new_v4();
        assert!(matches!(resolve_note_dir(&state, id), Err(AppError::NotFound(value)) if value == id.to_string()));
    }

    #[test]
    fn preview_revisions_increase_and_missing_note_is_rejected() {
        let root = tempfile::tempdir().unwrap();
        let (_, indexed) = create_note_in(root.path(), "", Some("Preview")).unwrap();
        let id = indexed.metadata.id;
        let state = AppState::new(root.path().to_path_buf(), Settings::default(), root.path().to_path_buf());
        state.note_index.write().unwrap().upsert(indexed);
        assert!(matches!(set_draft(&state, uuid::Uuid::new_v4(), "".into(), "".into(), "".into()), Err(AppError::NotFound(_))));
        let first = set_draft(&state, id, "one".into(), "".into(), "".into()).unwrap();
        state.preview_drafts.lock().unwrap().remove(&id);
        let second = set_draft(&state, id, "two".into(), "".into(), "".into()).unwrap();
        assert!(second > first);
        assert_eq!(state.preview_drafts.lock().unwrap()[&id].html, "two");
    }

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
