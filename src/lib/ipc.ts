import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";

import type { AppInfo, AssetInfo, BacklinkItem, BrokenLinkItem, ExportPdfResult, ExportSingleHtmlResult, ExportZipResult, NoteData, PreviewDraftPayload, RecoveryDraft, SaveNotePayload, SaveNoteResult, SearchNotesResult, Settings, SettingsPatch, TrashItem, TreeNode, UpdateMetadataPatch, UpdateMetadataResult, WriteDraftPayload } from "@/lib/types";

export const ipc = {
  openExternalUrl(url: string): Promise<void> {
    return openUrl(url);
  },
  saveExportFile(defaultPath: string, extension: "pdf" | "html" | "zip"): Promise<string | null> {
    return save({ defaultPath, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
  },
  revealExportFile(path: string): Promise<void> {
    return revealItemInDir(path);
  },
  appInfo(): Promise<AppInfo> {
    return invoke<AppInfo>("app_info");
  },
  getSettings(): Promise<Settings> {
    return invoke<Settings>("get_settings");
  },
  updateSettings(patch: SettingsPatch): Promise<Settings> {
    return invoke<Settings>("update_settings", { patch });
  },
  setRootDir(path: string): Promise<Settings> {
    return invoke<Settings>("set_root_dir", { path });
  },
  pickDirectory(defaultPath?: string): Promise<string | null> {
    return open({ directory: true, multiple: false, defaultPath });
  },
  getRootDir(): Promise<string> {
    return invoke<string>("get_root_dir");
  },
  getNoteOrigin(): Promise<string> {
    return invoke<string>("get_note_origin");
  },
  getNoteTree(): Promise<TreeNode[]> {
    return invoke<TreeNode[]>("get_note_tree");
  },
  searchNotes(query: string, limit?: number): Promise<SearchNotesResult> {
    return invoke<SearchNotesResult>("search_notes", { query, limit: limit ?? null });
  },
  getBacklinks(id: string): Promise<BacklinkItem[]> {
    return invoke<BacklinkItem[]>("get_backlinks", { id });
  },
  getBrokenLinks(id: string): Promise<BrokenLinkItem[]> {
    return invoke<BrokenLinkItem[]>("get_broken_links", { id });
  },
  readNote(id: string): Promise<NoteData> {
    return invoke<NoteData>("read_note", { id });
  },
  exportSingleHtml(id: string, targetPath: string): Promise<ExportSingleHtmlResult> {
    return invoke<ExportSingleHtmlResult>("export_single_html", { id, targetPath });
  },
  exportZip(id: string, targetPath: string): Promise<ExportZipResult> {
    return invoke<ExportZipResult>("export_zip", { id, targetPath });
  },
  exportPdf(id: string, targetPath: string): Promise<ExportPdfResult> {
    return invoke<ExportPdfResult>("export_pdf", { id, targetPath });
  },
  saveNote(id: string, payload: SaveNotePayload): Promise<SaveNoteResult> {
    return invoke<SaveNoteResult>("save_note", { id, payload: { ...payload, css: payload.css ?? "", js: payload.js ?? "" } });
  },
  updateMetadata(id: string, patch: UpdateMetadataPatch): Promise<UpdateMetadataResult> {
    return invoke<UpdateMetadataResult>("update_metadata", { id, patch });
  },
  copyAsset(noteId: string, sourcePath: string): Promise<AssetInfo> {
    return invoke<AssetInfo>("copy_asset", { noteId, sourcePath });
  },
  saveAssetBytes(noteId: string, suggestedName: string, bytes: Uint8Array): Promise<AssetInfo> {
    return invoke<AssetInfo>("save_asset_bytes", { noteId, suggestedName, bytes: Array.from(bytes) });
  },
  setPreviewDraft(id: string, payload: PreviewDraftPayload): Promise<number> {
    return invoke<number>("set_preview_draft", { id, ...payload });
  },
  clearPreviewDraft(id: string): Promise<void> {
    return invoke<void>("clear_preview_draft", { id });
  },
  writeDraft(id: string, payload: WriteDraftPayload): Promise<void> {
    return invoke<void>("write_draft", { id, payload });
  },
  readDraft(id: string): Promise<RecoveryDraft> {
    return invoke<RecoveryDraft>("read_draft", { id });
  },
  deleteDraft(id: string): Promise<void> {
    return invoke<void>("delete_draft", { id });
  },
  listDrafts(): Promise<RecoveryDraft[]> {
    return invoke<RecoveryDraft[]>("list_drafts");
  },
  createNote(parentRelPath: string, title?: string): Promise<TreeNode> {
    return invoke<TreeNode>("create_note", { parentRelPath, title: title ?? null });
  },
  createFolder(parentRelPath: string, name: string): Promise<TreeNode> {
    return invoke<TreeNode>("create_folder", { parentRelPath, name });
  },
  renameNote(id: string, newTitle: string): Promise<TreeNode> {
    return invoke<TreeNode>("rename_note", { id, newTitle });
  },
  renameFolder(relPath: string, newName: string): Promise<TreeNode> {
    return invoke<TreeNode>("rename_folder", { relPath, newName });
  },
  moveItem(relPath: string, targetFolderRelPath: string): Promise<string> {
    return invoke<string>("move_item", { relPath, targetFolderRelPath });
  },
  revealInExplorer(relPath: string): Promise<void> {
    return invoke<void>("reveal_in_explorer", { relPath });
  },
  deleteItem(relPath: string): Promise<TrashItem> {
    return invoke<TrashItem>("delete_item", { relPath });
  },
  listTrash(): Promise<TrashItem[]> {
    return invoke<TrashItem[]>("list_trash");
  },
  restoreFromTrash(trashId: string): Promise<string> {
    return invoke<string>("restore_from_trash", { trashId });
  },
  deletePermanently(trashId: string): Promise<void> {
    return invoke<void>("delete_permanently", { trashId });
  },
  emptyTrash(): Promise<void> {
    return invoke<void>("empty_trash");
  },
};
