import { mockIPC } from "@tauri-apps/api/mocks";
import { describe, expect, it, vi } from "vitest";

import { ipc } from "@/lib/ipc";
import type { AppInfo } from "@/lib/types";

describe("ipc.appInfo", () => {
  it("app_info komutundan tipli yanıt döndürür", async () => {
    const info: AppInfo = { version: "0.1.0", platform: "windows" };
    const handler = vi.fn((command: string) => {
      if (command === "app_info") {
        return info;
      }
      throw new Error(`Beklenmeyen komut: ${command}`);
    });
    mockIPC(handler);

    await expect(ipc.appInfo()).resolves.toEqual(info);
    expect(handler).toHaveBeenCalledWith("app_info", {});
  });
});

describe("ipc.getNoteTree", () => {
  it("get_note_tree komutundan ağacı döndürür", async () => {
    const handler = vi.fn((command: string) => {
      if (command === "get_note_tree") return [];
      throw new Error(`Beklenmeyen komut: ${command}`);
    });
    mockIPC(handler);
    await expect(ipc.getNoteTree()).resolves.toEqual([]);
    expect(handler).toHaveBeenCalledWith("get_note_tree", {});
  });
});
