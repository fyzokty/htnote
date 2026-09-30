import { invoke } from "@tauri-apps/api/core";

import type { AppInfo } from "@/lib/types";

export const ipc = {
  appInfo(): Promise<AppInfo> {
    return invoke<AppInfo>("app_info");
  },
};
