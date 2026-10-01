import { invoke } from "@tauri-apps/api/core";

import type { AppInfo, Settings, SettingsPatch, TreeNode } from "@/lib/types";

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
};
