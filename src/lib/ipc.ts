import { invoke } from "@tauri-apps/api/core";

import type { AppInfo, NoteData, Settings, SettingsPatch, TreeNode } from "@/lib/types";

export const ipc = {
  appInfo(): Promise<AppInfo> {
    return invoke<AppInfo>("app_info");
  },
  getSettings(): Promise<Settings> {
    return invoke<Settings>("get_settings");
  },
  updateSettings(patch: SettingsPatch): Promise<Settings> {
    return invoke<Settings>("update_settings", { patch });
  },
  getRootDir(): Promise<string> {
    return invoke<string>("get_root_dir");
  },
  getNoteTree(): Promise<TreeNode[]> {
    return invoke<TreeNode[]>("get_note_tree");
  },
  readNote(id: string): Promise<NoteData> {
    return invoke<NoteData>("read_note", { id });
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
};
