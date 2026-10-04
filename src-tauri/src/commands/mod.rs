use serde::Serialize;

use crate::error::AppError;
use crate::export::{pdf, single_html, zip, ExportResult};
use crate::drafts::{self, DraftData};
use crate::index::scan::{self, TreeNode};
use crate::notes::create;
use crate::notes::metadata_update::{self, MetadataPatch, MetadataUpdateResult};
use crate::notes::asset::{self, AssetInfo};
use crate::notes::read::{self, NoteData};
use crate::notes::rename;
use crate::notes::save::{self, SaveNoteInput, SaveNoteOutput};
use crate::index::scan::IndexedNote;
use crate::settings::{self, Settings, SettingsPatch};
use crate::search::{self, SearchNotesResult};
use crate::links::{BacklinkItem, BrokenLinkItem};
use crate::state::AppState;
use crate::trash::{self, TrashItem};
use tauri::{Manager, State};
use std::sync::atomic::Ordering;
use std::path::PathBuf;

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
        let candidate = updated.root_dir.as_ref().map(PathBuf::from).unwrap_or_else(|| fallback.join("HTNote"));
        Some(settings::validate_new_root(&candidate)?)
    } else { None };
    if let Some(root) = new_root {
        switch_root(&state, &app, &mut settings, updated.clone(), root)?;
    } else {
        settings::save_settings_atomic(&state.config_dir, &updated)?;
        *settings = updated.clone();
    }
    Ok(updated)
}

#[tauri::command]
pub fn set_root_dir(path: String, app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Settings, AppError> {
    let root = settings::validate_new_root(PathBuf::from(&path).as_path())?;
    let mut settings = state.settings.lock().map_err(|error| AppError::Internal(error.to_string()))?;
    let mut updated = settings.clone();
    updated.root_dir = Some(root.to_string_lossy().into_owned());
    switch_root(&state, &app, &mut settings, updated.clone(), root)?;
    Ok(updated)
}

#[tauri::command]
pub fn validate_root_dir(path: String) -> Result<(), AppError> {
    settings::validate_root_dir(PathBuf::from(path).as_path())
}

fn switch_root(state: &AppState, app: &tauri::AppHandle, settings: &mut Settings, updated: Settings, root: PathBuf) -> Result<(), AppError> {
    switch_root_with_watcher(state, settings, updated, root, |state| crate::watcher::start_for_app(state, app.clone()))
}

fn switch_root_with_watcher(state: &AppState, settings: &mut Settings, updated: Settings, root: PathBuf,
    mut start_watcher: impl FnMut(&AppState) -> Result<(), AppError>) -> Result<(), AppError> {
    // Bu komut senkron olduğundan bekleyemez; başlangıç taraması ve watcher'ı ile yarışmamak için reddeder.
    // Açılış ekranı ağaç hazır olana kadar arayüzü örttüğünden normal akışta buraya gelinmez.
    if !state.index_ready.is_ready() {
        return Err(AppError::Internal("Note index is still loading".into()));
    }
    let result = scan::scan(&root)?;
    let mut live_root = state.root_dir.write().map_err(|error| AppError::Internal(error.to_string()))?;
    let mut live_index = state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?;
    let previous_settings = settings.clone();
    settings::save_settings_atomic(&state.config_dir, &updated)?;
    let previous_root = std::mem::replace(&mut *live_root, root.clone());
    let mut replacement = crate::index::note_index::NoteIndex::new(root);
    replacement.replace_all(result);
    let previous_index = std::mem::replace(&mut *live_index, replacement);
    drop(live_root);
    drop(live_index);
    if let Err(error) = start_watcher(state) {
        *state.root_dir.write().map_err(|lock| AppError::Internal(lock.to_string()))? = previous_root;
        *state.note_index.write().map_err(|lock| AppError::Internal(lock.to_string()))? = previous_index;
        settings::save_settings_atomic(&state.config_dir, &previous_settings)?;
        if let Err(restart_error) = start_watcher(state) {
            eprintln!("File watcher rollback restart failed: {restart_error}");
        }
        return Err(error);
    }
    *settings = updated;
    search::start_build(state);
    Ok(())
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

/// İlk tarama bitene kadar bekler; beklemek gerektiyse `true` döner. Bekleme ana iş parçacığını
/// tutmamak için engelleyici havuzda yapılır.
async fn wait_for_index(app: &tauri::AppHandle) -> Result<bool, AppError> {
    let ready = std::sync::Arc::clone(&app.state::<AppState>().index_ready);
    if ready.is_ready() { return Ok(false); }
    tauri::async_runtime::spawn_blocking(move || ready.wait())
        .await.map_err(|error| AppError::Internal(error.to_string()))
}

#[tauri::command]
pub async fn get_note_tree(app: tauri::AppHandle) -> Result<Vec<TreeNode>, AppError> {
    let waited = wait_for_index(&app).await?;
    note_tree_after_ready(&app.state::<AppState>(), waited).await
}

/// İlk taramayı bekleyen çağrı, istekten sonra başlamış bir taramayı yinelemez: başlangıç taraması
/// istekten önce başlamış olsa bile arada olan değişiklikleri watcher indekse uygular ve `fs-change` gönderir.
pub async fn note_tree_after_ready(state: &AppState, waited_for_initial_scan: bool) -> Result<Vec<TreeNode>, AppError> {
    if waited_for_initial_scan {
        let index = state.note_index.read().map_err(|error| AppError::Internal(error.to_string()))?;
        // Boş indeks başarısız bir ilk taramadan gelebilir; boş kökte yeniden tarama zaten ucuzdur.
        if !index.tree.is_empty() { return Ok(index.tree.clone()); }
    }
    scan_and_replace(state).await
}

#[tauri::command]
pub fn search_notes(state: State<'_, AppState>, query: String, limit: Option<usize>) -> Result<SearchNotesResult, AppError> {
    let results = state.search_index.read().map_err(|error| AppError::Internal(error.to_string()))?
        .search(&query, limit.unwrap_or(100));
    Ok(SearchNotesResult { results, indexing: state.search_indexing.load(Ordering::Acquire) })
}

fn backlinks_in_state(state: &AppState, id: uuid::Uuid) -> Result<Vec<BacklinkItem>, AppError> {
    let incoming = state.link_index.read().map_err(|error| AppError::Internal(error.to_string()))?.backlinks(id);
    let index = state.note_index.read().map_err(|error| AppError::Internal(error.to_string()))?;
    let mut items = incoming.into_iter().filter_map(|(source, snippet)| {
        index.by_id.get(&source).map(|note| BacklinkItem {
            id: source, title: note.metadata.title.clone(), rel_path: note.rel_path.clone(), snippet,
        })
    }).collect::<Vec<_>>();
    items.sort_by(|a, b| a.title.cmp(&b.title).then_with(|| a.id.cmp(&b.id)));
    Ok(items)
}

fn broken_links_in_state(state: &AppState, id: uuid::Uuid) -> Result<Vec<BrokenLinkItem>, AppError> {
    let candidates = state.link_index.read().map_err(|error| AppError::Internal(error.to_string()))?
        .broken(id, |_| false);
    let index = state.note_index.read().map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(candidates.into_iter().filter(|item| !index.by_id.contains_key(&item.target_id)).collect())
}

#[tauri::command]
pub fn get_backlinks(state: State<'_, AppState>, id: uuid::Uuid) -> Result<Vec<BacklinkItem>, AppError> {
    backlinks_in_state(&state, id)
}

#[tauri::command]
pub fn get_broken_links(state: State<'_, AppState>, id: uuid::Uuid) -> Result<Vec<BrokenLinkItem>, AppError> {
    broken_links_in_state(&state, id)
}

#[tauri::command]
pub async fn read_note(app: tauri::AppHandle, id: uuid::Uuid) -> Result<NoteData, AppError> {
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let dir = resolve_note_dir(&state, id)?;
        read::read_note_dir(&dir)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn export_single_html(app: tauri::AppHandle, id: uuid::Uuid, target_path: String) -> Result<ExportResult, AppError> {
    let target = std::path::PathBuf::from(target_path);
    if !target.is_absolute() {
        return Err(AppError::InvalidName("Export target must be absolute".into()));
    }
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let dir = resolve_note_dir(&app.state::<AppState>(), id)?;
        let built = single_html::build_single_html(&dir)?;
        crate::fs_util::write_file_atomic(&target, built.html.as_bytes())?;
        Ok(ExportResult { warnings: built.warnings })
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn export_zip(app: tauri::AppHandle, id: uuid::Uuid, target_path: String) -> Result<ExportResult, AppError> {
    let target = std::path::PathBuf::from(target_path);
    if !target.is_absolute() {
        return Err(AppError::InvalidName("Export target must be absolute".into()));
    }
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let dir = resolve_note_dir(&app.state::<AppState>(), id)?;
        zip::export_zip_to(&dir, &target)?;
        Ok(ExportResult { warnings: Vec::new() })
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn export_pdf(app: tauri::AppHandle, id: uuid::Uuid, target_path: String) -> Result<ExportResult, AppError> {
    let target = std::path::PathBuf::from(target_path);
    if !target.is_absolute() {
        return Err(AppError::InvalidName("Export target must be absolute".into()));
    }
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || pdf::export(app, id, &target))
        .await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn save_note(app: tauri::AppHandle, id: uuid::Uuid, payload: SaveNoteInput) -> Result<SaveNoteOutput, AppError> {
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        save_note_in_state(&state, id, payload, |dir, input| save::save_note_dir(dir, input, chrono::Utc::now()))
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn update_metadata(app: tauri::AppHandle, id: uuid::Uuid, patch: MetadataPatch) -> Result<MetadataUpdateResult, AppError> {
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        update_metadata_in_state(&state, id, patch)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

fn update_metadata_in_state(state: &AppState, id: uuid::Uuid, patch: MetadataPatch) -> Result<MetadataUpdateResult, AppError> {
    let mut index = state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?;
    let indexed = index.by_id.get(&id).cloned().ok_or_else(|| AppError::NotFound(id.to_string()))?;
    let dir = index.resolve(id).ok_or_else(|| AppError::NotFound(id.to_string()))?;
    let result = metadata_update::update_metadata_in(&dir, patch)?;
    index.upsert(IndexedNote { rel_path: indexed.rel_path, metadata: result.metadata.clone(), content_stamp: indexed.content_stamp });
    drop(index);
    search::reindex_notes(&state.note_index, &state.search_index, &state.link_index, &[id], &[])?;
    state.last_saved_hashes.lock().map_err(|error| AppError::Internal(error.to_string()))?
        .insert(id, result.content_hash.clone());
    Ok(result)
}

#[tauri::command]
pub async fn copy_asset(app: tauri::AppHandle, note_id: uuid::Uuid, source_path: String) -> Result<AssetInfo, AppError> {
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let dir = resolve_note_dir(&app.state::<AppState>(), note_id)?;
        asset::copy_asset(&dir, std::path::Path::new(&source_path))
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn open_note_asset(app: tauri::AppHandle, note_id: uuid::Uuid, rel_path: String) -> Result<(), AppError> {
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let dir = resolve_note_dir(&app.state::<AppState>(), note_id)?;
        asset::open_asset(&dir, &rel_path, |path| {
            crate::external::open_path(&app, path)
        })
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn save_asset_bytes(app: tauri::AppHandle, note_id: uuid::Uuid, suggested_name: String, bytes: Vec<u8>) -> Result<AssetInfo, AppError> {
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let dir = resolve_note_dir(&app.state::<AppState>(), note_id)?;
        asset::save_asset_bytes(&dir, &suggested_name, &bytes)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteDraftInput {
    html: String,
    css: String,
    js: String,
    base_hash: String,
    saved_at: chrono::DateTime<chrono::Utc>,
}

#[tauri::command]
pub async fn write_draft(app: tauri::AppHandle, id: uuid::Uuid, payload: WriteDraftInput) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = app.state::<AppState>().drafts_dir.clone();
        drafts::write_draft_in(&dir, &DraftData { id, html: payload.html, css: payload.css, js: payload.js, base_hash: payload.base_hash, saved_at: payload.saved_at })
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn read_draft(app: tauri::AppHandle, id: uuid::Uuid) -> Result<DraftData, AppError> {
    tauri::async_runtime::spawn_blocking(move || drafts::read_draft_in(&app.state::<AppState>().drafts_dir, id))
        .await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn delete_draft(app: tauri::AppHandle, id: uuid::Uuid) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || drafts::delete_draft_in(&app.state::<AppState>().drafts_dir, id))
        .await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn list_drafts(app: tauri::AppHandle) -> Result<Vec<DraftData>, AppError> {
    tauri::async_runtime::spawn_blocking(move || drafts::list_drafts_in(&app.state::<AppState>().drafts_dir))
        .await.map_err(|error| AppError::Internal(error.to_string()))?
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
    index.upsert(IndexedNote { rel_path: indexed.rel_path, metadata: result.metadata.clone(), content_stamp: None });
    drop(index);
    search::reindex_notes(&state.note_index, &state.search_index, &state.link_index, &[id], &[])?;
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
    wait_for_index(&app).await?;
    let state = app.state::<AppState>();
    let root = state.root_dir.read().map_err(|error| AppError::Internal(error.to_string()))?.clone();
    let (node, indexed) = tauri::async_runtime::spawn_blocking(move || {
        create::create_note_in(&root, &parent_rel_path, title.as_deref())
    }).await.map_err(|error| AppError::Internal(error.to_string()))??;
    let id = indexed.metadata.id;
    state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?.upsert(indexed);
    search::reindex_notes(&state.note_index, &state.search_index, &state.link_index, &[id], &[])?;
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
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut index = state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?;
        let note = index.by_id.get(&id).cloned().ok_or_else(|| AppError::NotFound(id.to_string()))?;
        let (node, _) = rename::rename_note_in(&index.root, &note, &new_title)?;
        index.refresh_readonly()?;
        drop(index);
        search::reindex_notes(&state.note_index, &state.search_index, &state.link_index, &[id], &[])?;
        Ok(node)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn rename_folder(app: tauri::AppHandle, rel_path: String, new_name: String) -> Result<TreeNode, AppError> {
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut index = state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?;
        let node = rename::rename_folder_in(&index.root, &rel_path, &new_name)?;
        index.refresh_readonly()?;
        drop(index);
        reindex_all(&state)?;
        Ok(node)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn move_item(app: tauri::AppHandle, rel_path: String, target_folder_rel_path: String) -> Result<String, AppError> {
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut index = state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?;
        let new_rel = rename::move_item_in(&index.root, &rel_path, &target_folder_rel_path)?;
        index.refresh_readonly()?;
        drop(index);
        reindex_all(&state)?;
        Ok(new_rel)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn reveal_in_explorer(app: tauri::AppHandle, rel_path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let root = state.root_dir.read().map_err(|error| AppError::Internal(error.to_string()))?;
        let path = if std::path::Path::new(&rel_path) == root.as_path() {
            root.to_path_buf()
        } else {
            crate::index::resolve_in_root(&root, &rel_path)?
        };
        if !path.exists() { return Err(AppError::NotFound(rel_path)); }
        crate::external::reveal_in_dir(&path)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

pub async fn scan_and_replace(state: &AppState) -> Result<Vec<TreeNode>, AppError> {
    let root = state.root_dir.read().map_err(|error| AppError::Internal(error.to_string()))?.clone();
    let result = tauri::async_runtime::spawn_blocking(move || scan::scan(&root))
        .await.map_err(|error| AppError::Internal(error.to_string()))??;
    let tree = result.tree.clone();
    let (changed, removed) = {
        let mut index = state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?;
        let (changed, removed) = scan_diff(&index, &result);
        index.replace_all(result);
        (changed, removed)
    };
    search::reindex_notes(&state.note_index, &state.search_index, &state.link_index, &changed, &removed)?;
    Ok(tree)
}

fn scan_diff(index: &crate::index::note_index::NoteIndex, result: &scan::ScanResult) -> (Vec<uuid::Uuid>, Vec<uuid::Uuid>) {
    let changed = result.notes.iter().filter(|note| {
        index.by_id.get(&note.metadata.id).is_none_or(|old| {
            old.rel_path != note.rel_path
                || old.metadata != note.metadata
                || old.content_stamp != note.content_stamp
        })
    }).map(|note| note.metadata.id).collect();
    let current = result.notes.iter().map(|note| note.metadata.id).collect::<std::collections::HashSet<_>>();
    let removed = index.by_id.keys().filter(|id| !current.contains(id)).copied().collect();
    (changed, removed)
}

fn reindex_all(state: &AppState) -> Result<(), AppError> {
    let ids = state.note_index.read().map_err(|error| AppError::Internal(error.to_string()))?
        .by_id.keys().copied().collect::<Vec<_>>();
    state.search_index.write().map_err(|error| AppError::Internal(error.to_string()))?.clear();
    state.link_index.write().map_err(|error| AppError::Internal(error.to_string()))?.clear();
    search::reindex_notes(&state.note_index, &state.search_index, &state.link_index, &ids, &[])?;
    state.search_indexing.store(false, Ordering::Release);
    Ok(())
}

#[tauri::command]
pub async fn delete_item(app: tauri::AppHandle, rel_path: String) -> Result<TrashItem, AppError> {
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        delete_item_in_state(&app.state::<AppState>(), &rel_path)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

fn delete_item_in_state(state: &AppState, rel_path: &str) -> Result<TrashItem, AppError> {
    let mut index = state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?;
    let item = trash::delete_item(&index.root, rel_path)?;
    index.refresh_readonly()?;
    drop(index);
    reindex_all(state)?;
    Ok(item)
}

#[tauri::command]
pub async fn list_trash(app: tauri::AppHandle) -> Result<Vec<TrashItem>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = app.state::<AppState>().root_dir.read().map_err(|error| AppError::Internal(error.to_string()))?.clone();
        trash::list_trash(&root)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn restore_from_trash(app: tauri::AppHandle, trash_id: String) -> Result<String, AppError> {
    wait_for_index(&app).await?;
    tauri::async_runtime::spawn_blocking(move || {
        restore_from_trash_in_state(&app.state::<AppState>(), &trash_id)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

fn restore_from_trash_in_state(state: &AppState, trash_id: &str) -> Result<String, AppError> {
    let mut index = state.note_index.write().map_err(|error| AppError::Internal(error.to_string()))?;
    let ids = index.by_id.keys().copied().collect();
    let rel = trash::restore_from_trash(&index.root, trash_id, &ids)?;
    index.refresh_readonly()?;
    drop(index);
    reindex_all(state)?;
    Ok(rel)
}

#[tauri::command]
pub async fn delete_permanently(app: tauri::AppHandle, trash_id: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = app.state::<AppState>().root_dir.read().map_err(|error| AppError::Internal(error.to_string()))?.clone();
        trash::delete_permanently(&root, &trash_id)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn empty_trash(app: tauri::AppHandle) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = app.state::<AppState>().root_dir.read().map_err(|error| AppError::Internal(error.to_string()))?.clone();
        trash::empty_trash(&root)
    }).await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::create::create_note_in;
    use crate::notes::model::{write_metadata_atomic, NoteMetadata};
    use crate::notes::read::read_note_dir;

    #[test]
    fn validate_root_dir_command_rejects_note_paths_without_side_effects() {
        let root = tempfile::tempdir().unwrap();
        let note = root.path().join("Note");
        std::fs::create_dir(&note).unwrap();
        std::fs::write(note.join("metadata.json"), "{}").unwrap();
        std::fs::write(note.join("index.html"), "").unwrap();
        let child = note.join("nested");

        assert!(matches!(validate_root_dir(note.to_string_lossy().into_owned()), Err(AppError::NotAFolder(_))));
        assert!(matches!(validate_root_dir(child.to_string_lossy().into_owned()), Err(AppError::NotAFolder(_))));
        assert!(!child.exists());
        assert!(!note.join(".trash").exists());
    }

    #[test]
    fn failed_watcher_start_restores_root_settings_and_index() {
        let old = tempfile::tempdir().unwrap();
        let new = tempfile::tempdir().unwrap();
        let (_, old_note) = create_note_in(old.path(), "", Some("Old")).unwrap();
        let (_, new_note) = create_note_in(new.path(), "", Some("New")).unwrap();
        let original = Settings {
            root_dir: Some(old.path().to_string_lossy().into_owned()),
            ..Settings::default()
        };
        let state = AppState::new(old.path().to_path_buf(), original.clone(), old.path().to_path_buf());
        state.note_index.write().unwrap().upsert(old_note.clone());
        settings::save_settings_atomic(&state.config_dir, &original).unwrap();
        let mut updated = original.clone();
        updated.root_dir = Some(new.path().to_string_lossy().into_owned());
        let mut live_settings = original.clone();
        let mut watcher_roots = Vec::new();
        let error = switch_root_with_watcher(&state, &mut live_settings, updated, new.path().to_path_buf(), |state| {
            watcher_roots.push(state.root_dir.read().unwrap().clone());
            if watcher_roots.len() == 1 {
                Err(AppError::Internal("watcher failed".into()))
            } else {
                Ok(())
            }
        });
        assert!(matches!(error, Err(AppError::Internal(message)) if message == "watcher failed"));
        assert_eq!(watcher_roots, vec![new.path().to_path_buf(), old.path().to_path_buf()]);
        assert_eq!(live_settings, original);
        assert_eq!(*state.root_dir.read().unwrap(), old.path());
        let index = state.note_index.read().unwrap();
        assert_eq!(index.root, old.path());
        assert!(index.by_id.contains_key(&old_note.metadata.id));
        assert!(!index.by_id.contains_key(&new_note.metadata.id));
        assert_eq!(settings::load_settings(&state.config_dir).unwrap(), original);
    }

    #[test]
    fn root_index_switch_replaces_old_notes_and_rebuilds_search_and_links() {
        let old = tempfile::tempdir().unwrap();
        let new = tempfile::tempdir().unwrap();
        let (_, old_note) = create_note_in(old.path(), "", Some("Old")).unwrap();
        let (_, new_note) = create_note_in(new.path(), "", Some("New")).unwrap();
        let state = AppState::new(old.path().to_path_buf(), Settings::default(), old.path().to_path_buf());
        state.note_index.write().unwrap().upsert(old_note.clone());
        let mut settings = Settings::default();
        switch_root_with_watcher(&state, &mut settings, Settings::default(), new.path().to_path_buf(), |_| Ok(())).unwrap();
        for _ in 0..100 {
            if !state.search_indexing.load(Ordering::Acquire) { break; }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let index = state.note_index.read().unwrap();
        assert_eq!(index.root, new.path());
        assert!(!index.by_id.contains_key(&old_note.metadata.id));
        assert!(index.by_id.contains_key(&new_note.metadata.id));
        let search = state.search_index.read().unwrap();
        assert!(!search.search("Old", 10).iter().any(|note| note.id == old_note.metadata.id));
    }

    #[test]
    fn backlink_commands_follow_edits_and_deleted_targets() {
        let root = tempfile::tempdir().unwrap();
        let (_, source) = create_note_in(root.path(), "", Some("Source")).unwrap();
        let (_, target) = create_note_in(root.path(), "", Some("Target")).unwrap();
        let source_id = source.metadata.id;
        let target_id = target.metadata.id;
        let state = AppState::new(root.path().to_path_buf(), Settings::default(), root.path().to_path_buf());
        state.note_index.write().unwrap().upsert(source.clone());
        state.note_index.write().unwrap().upsert(target);
        let path = root.path().join(&source.rel_path).join("index.html");
        std::fs::write(&path, format!("<p>See <a href='htnote://note/{target_id}'>Target</a> now</p>")).unwrap();
        search::reindex_notes(&state.note_index, &state.search_index, &state.link_index, &[source_id], &[]).unwrap();
        let incoming = backlinks_in_state(&state, target_id).unwrap();
        assert_eq!(incoming.len(), 1);
        assert_eq!(incoming[0].title, "Source");
        assert!(incoming[0].snippet.contains("See Target now"));
        state.note_index.write().unwrap().remove_subtree("Target");
        assert_eq!(broken_links_in_state(&state, source_id).unwrap()[0].target_id, target_id);
        std::fs::write(&path, "<p>No link</p>").unwrap();
        search::reindex_notes(&state.note_index, &state.search_index, &state.link_index, &[source_id], &[]).unwrap();
        assert!(backlinks_in_state(&state, target_id).unwrap().is_empty());
        assert!(broken_links_in_state(&state, source_id).unwrap().is_empty());
    }

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
    fn metadata_update_refreshes_index_search_and_last_saved_hash() {
        let root = tempfile::tempdir().unwrap();
        let (_, indexed) = create_note_in(root.path(), "", Some("Başlık")).unwrap();
        let id = indexed.metadata.id;
        let original_updated_at = crate::notes::model::read_metadata(&root.path().join(&indexed.rel_path).join("metadata.json")).unwrap().updated_at;
        let state = AppState::new(root.path().to_path_buf(), Settings::default(), root.path().to_path_buf());
        state.note_index.write().unwrap().upsert(indexed);
        let result = update_metadata_in_state(&state, id, MetadataPatch { is_favorite: Some(true), tags: Some(vec!["etiket".into()]) }).unwrap();
        assert_eq!(state.note_index.read().unwrap().by_id[&id].metadata.tags, vec!["etiket"]);
        assert!(state.note_index.read().unwrap().by_id[&id].metadata.is_favorite);
        assert_eq!(result.metadata.updated_at, original_updated_at);
        assert_eq!(state.last_saved_hashes.lock().unwrap().get(&id), Some(&result.content_hash));
        assert_eq!(result.content_hash, read_note_dir(&resolve_note_dir(&state, id).unwrap()).unwrap().content_hash);
        assert_eq!(state.search_index.read().unwrap().search("etiket", 10)[0].id, id);
    }

    #[test]
    fn saving_dirty_note_after_metadata_update_keeps_favorite_and_tags() {
        let root = tempfile::tempdir().unwrap();
        let (_, indexed) = create_note_in(root.path(), "", Some("Başlık")).unwrap();
        let id = indexed.metadata.id;
        let now = indexed.metadata.updated_at + chrono::Duration::seconds(1);
        let state = AppState::new(root.path().to_path_buf(), Settings::default(), root.path().to_path_buf());
        state.note_index.write().unwrap().upsert(indexed);
        let dir = resolve_note_dir(&state, id).unwrap();
        let stale_html = read_note_dir(&dir).unwrap().html;

        let updated = update_metadata_in_state(&state, id, MetadataPatch {
            is_favorite: Some(true),
            tags: Some(vec![" etiket ".into()]),
        }).unwrap();
        let mut draft = save_input(Some(updated.content_hash));
        draft.html = stale_html.replace("</body>", "<p>Kirli taslak</p></body>");
        let saved = save_note_in_state(&state, id, draft, |dir, input| {
            save::save_note_dir(dir, input, now)
        }).unwrap();

        assert!(saved.metadata.is_favorite);
        assert_eq!(saved.metadata.tags, vec!["etiket"]);
        let on_disk = read_note_dir(&dir).unwrap();
        assert!(on_disk.metadata.is_favorite);
        assert_eq!(on_disk.metadata.tags, vec!["etiket"]);
        assert!(on_disk.html.contains("<p>Kirli taslak</p>"));
        assert!(on_disk.html.contains("htnote-tags\" content=\"etiket"));
        assert_eq!(state.note_index.read().unwrap().by_id[&id].metadata.tags, vec!["etiket"]);
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
        assert_eq!(state.search_index.read().unwrap().search("Not", 10)[0].id, metadata.id);
        std::fs::remove_dir_all(note).unwrap();
        assert!(tauri::async_runtime::block_on(scan_and_replace(&state)).unwrap().is_empty());
        assert!(state.note_index.read().unwrap().resolve(metadata.id).is_none());
        assert!(state.search_index.read().unwrap().search("Not", 10).is_empty());
    }

    #[test]
    fn tree_request_that_waited_for_initial_scan_reuses_index_tree() {
        let root = tempfile::tempdir().unwrap();
        let (_, first) = create_note_in(root.path(), "", Some("First")).unwrap();
        let state = AppState::new(root.path().to_path_buf(), Settings::default(), root.path().to_path_buf());
        state.note_index.write().unwrap().replace_all(scan::scan(root.path()).unwrap());
        // Sonradan eklenen notu watcher bildirir; bekleyen ilk istek ikinci tam taramayı yapmaz.
        let (_, second) = create_note_in(root.path(), "", Some("Second")).unwrap();
        let waited = tauri::async_runtime::block_on(note_tree_after_ready(&state, true)).unwrap();
        assert!(matches!(&waited[..], [TreeNode::Note { id, .. }] if *id == first.metadata.id));
        let fresh = tauri::async_runtime::block_on(note_tree_after_ready(&state, false)).unwrap();
        assert_eq!(fresh.len(), 2);
        assert_eq!(state.note_index.read().unwrap().rel_path(second.metadata.id), Some("Second"));
    }

    #[test]
    fn tree_request_after_failed_initial_scan_rescans() {
        let root = tempfile::tempdir().unwrap();
        let (_, note) = create_note_in(root.path(), "", Some("Late")).unwrap();
        let state = AppState::new(root.path().to_path_buf(), Settings::default(), root.path().to_path_buf());
        let tree = tauri::async_runtime::block_on(note_tree_after_ready(&state, true)).unwrap();
        assert!(matches!(&tree[..], [TreeNode::Note { id, .. }] if *id == note.metadata.id));
    }

    #[test]
    fn root_switch_is_rejected_until_initial_scan_is_ready() {
        let old = tempfile::tempdir().unwrap();
        let new = tempfile::tempdir().unwrap();
        let state = AppState::with_drafts_dir(old.path().to_path_buf(), old.path().join("drafts"),
            Settings::default(), old.path().to_path_buf());
        let mut settings = Settings::default();
        let mut started = false;
        let result = switch_root_with_watcher(&state, &mut settings, Settings::default(), new.path().to_path_buf(), |_| {
            started = true;
            Ok(())
        });
        assert!(matches!(result, Err(AppError::Internal(_))));
        assert!(!started);
        assert_eq!(*state.root_dir.read().unwrap(), old.path());
        state.index_ready.mark_ready();
        switch_root_with_watcher(&state, &mut settings, Settings::default(), new.path().to_path_buf(), |_| Ok(())).unwrap();
        assert_eq!(*state.root_dir.read().unwrap(), new.path());
    }

    #[test]
    fn scan_diff_tracks_added_removed_moved_and_unchanged_notes() {
        let root = tempfile::tempdir().unwrap();
        let mut index = crate::index::note_index::NoteIndex::new(root.path().to_path_buf());
        let old = NoteMetadata::new("Old");
        let moved = NoteMetadata::new("Moved");
        let same = NoteMetadata::new("Same");
        let updated = NoteMetadata::new("Updated");
        for (metadata, rel_path) in [(&old, "Old"), (&moved, "Moved"), (&same, "Same"), (&updated, "Updated")] {
            index.by_id.insert(metadata.id, IndexedNote { rel_path: rel_path.into(), metadata: metadata.clone(), content_stamp: None });
        }
        let added = NoteMetadata::new("Added");
        let mut new_version = updated.clone();
        new_version.title = "Updated title".into();
        let result = scan::ScanResult {
            notes: vec![
                IndexedNote { rel_path: "Other/Moved".into(), metadata: moved.clone(), content_stamp: None },
                IndexedNote { rel_path: "Same".into(), metadata: same.clone(), content_stamp: None },
                IndexedNote { rel_path: "Updated".into(), metadata: new_version, content_stamp: None },
                IndexedNote { rel_path: "Added".into(), metadata: added.clone(), content_stamp: None },
            ],
            ..Default::default()
        };
        let (changed, removed) = scan_diff(&index, &result);
        assert_eq!(changed.len(), 3);
        assert!(changed.contains(&moved.id));
        assert!(changed.contains(&added.id));
        assert!(changed.contains(&updated.id));
        assert_eq!(removed, [old.id]);
    }

    #[test]
    fn scan_refreshes_favorite_and_html_without_timestamp_change() {
        let root = tempfile::tempdir().unwrap();
        let (_, note) = create_note_in(root.path(), "", Some("Favorite test")).unwrap();
        let path = root.path().join(&note.rel_path);
        let state = AppState::new(root.path().to_path_buf(), Settings::default(), root.path().to_path_buf());
        tauri::async_runtime::block_on(scan_and_replace(&state)).unwrap();
        let initial = scan::scan(root.path()).unwrap();
        assert_eq!(scan_diff(&state.note_index.read().unwrap(), &initial), (vec![], vec![]));

        let mut metadata = note.metadata.clone();
        metadata.is_favorite = true;
        write_metadata_atomic(&path.join("metadata.json"), &metadata).unwrap();
        let changed = scan::scan(root.path()).unwrap();
        assert_eq!(scan_diff(&state.note_index.read().unwrap(), &changed).0, [metadata.id]);
        let tree = tauri::async_runtime::block_on(scan_and_replace(&state)).unwrap();
        assert!(matches!(&tree[..], [TreeNode::Note { is_favorite: true, .. }]));
        assert!(matches!(&state.note_index.read().unwrap().tree[..], [TreeNode::Note { is_favorite: true, .. }]));

        std::fs::write(path.join("index.html"), "<p>Özgün içerik araması</p>").unwrap();
        let changed = scan::scan(root.path()).unwrap();
        assert_eq!(scan_diff(&state.note_index.read().unwrap(), &changed).0, [metadata.id]);
        tauri::async_runtime::block_on(scan_and_replace(&state)).unwrap();
        assert_eq!(state.search_index.read().unwrap().search("Özgün", 10)[0].id, metadata.id);
        assert_eq!(scan_diff(&state.note_index.read().unwrap(), &scan::scan(root.path()).unwrap()), (vec![], vec![]));
    }

    #[test]
    fn trash_commands_refresh_note_and_search_indexes_for_notes_and_folders() {
        let root = tempfile::tempdir().unwrap();
        let (_, single) = create_note_in(root.path(), "", Some("Single")).unwrap();
        std::fs::create_dir(root.path().join("Folder")).unwrap();
        let (_, nested) = create_note_in(root.path(), "Folder", Some("Nested")).unwrap();
        let state = AppState::new(root.path().to_path_buf(), Settings::default(), root.path().to_path_buf());
        tauri::async_runtime::block_on(scan_and_replace(&state)).unwrap();

        let single_trash = delete_item_in_state(&state, "Single").unwrap();
        let folder_trash = delete_item_in_state(&state, "Folder").unwrap();
        for (id, title) in [(single.metadata.id, "Single"), (nested.metadata.id, "Nested")] {
            assert!(state.note_index.read().unwrap().resolve(id).is_none());
            assert!(state.search_index.read().unwrap().search(title, 10).is_empty());
        }

        restore_from_trash_in_state(&state, &single_trash.trash_id).unwrap();
        restore_from_trash_in_state(&state, &folder_trash.trash_id).unwrap();
        for (id, path, title) in [(single.metadata.id, "Single", "Single"), (nested.metadata.id, "Folder/Nested", "Nested")] {
            assert_eq!(state.note_index.read().unwrap().rel_path(id), Some(path));
            assert_eq!(state.search_index.read().unwrap().search(title, 10)[0].id, id);
        }
    }

    #[test]
    fn restore_collision_keeps_indexed_note_id_and_reassigns_restored_id_on_disk() {
        let root = tempfile::tempdir().unwrap();
        let (_, original) = create_note_in(root.path(), "", Some("Original")).unwrap();
        let state = AppState::new(root.path().to_path_buf(), Settings::default(), root.path().to_path_buf());
        tauri::async_runtime::block_on(scan_and_replace(&state)).unwrap();
        let trashed = delete_item_in_state(&state, "Original").unwrap();

        let (_, mut existing) = create_note_in(root.path(), "", Some("Existing")).unwrap();
        existing.metadata.id = original.metadata.id;
        write_metadata_atomic(&root.path().join("Existing/metadata.json"), &existing.metadata).unwrap();
        tauri::async_runtime::block_on(scan_and_replace(&state)).unwrap();
        let restored_path = restore_from_trash_in_state(&state, &trashed.trash_id).unwrap();

        let restored_id = crate::notes::model::read_metadata(&root.path().join(&restored_path).join("metadata.json")).unwrap().id;
        assert_ne!(restored_id, original.metadata.id);
        assert_eq!(state.note_index.read().unwrap().rel_path(original.metadata.id), Some("Existing"));
        assert_eq!(state.note_index.read().unwrap().rel_path(restored_id), Some(restored_path.as_str()));
        assert_eq!(state.search_index.read().unwrap().search("Existing", 10)[0].id, original.metadata.id);
        assert_eq!(state.search_index.read().unwrap().search("Original", 10)[0].id, restored_id);
    }
}

#[tauri::command]
pub async fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || crate::external::open_url(&app, &url))
        .await.map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn reveal_path(path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || crate::external::reveal_in_dir(std::path::Path::new(&path)))
        .await.map_err(|error| AppError::Internal(error.to_string()))?
}
