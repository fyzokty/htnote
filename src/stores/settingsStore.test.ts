import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it } from "vitest";

import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";

const defaults: Settings = {
  rootDir: null,
  theme: "system",
  language: null,
  sidebarWidth: 260,
  sidebarVisible: true,
  openTabs: [],
  activeTab: null,
  expandedFolders: [],
};

beforeEach(() => {
  useSettingsStore.setState({ settings: null, status: "idle" });
});

describe("settingsStore", () => {
  it("loads settings from IPC", async () => {
    mockIPC((command) => command === "get_settings" ? defaults : undefined);
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().settings).toEqual(defaults);
    expect(useSettingsStore.getState().status).toBe("ready");
  });

  it("updates optimistically and keeps the saved result", async () => {
    useSettingsStore.setState({ settings: defaults, status: "ready" });
    let resolveUpdate: (settings: Settings) => void = () => {};
    mockIPC((command) => command === "update_settings"
      ? new Promise<Settings>((resolve) => { resolveUpdate = resolve; })
      : undefined);
    const pending = useSettingsStore.getState().update({ theme: "dark" });
    expect(useSettingsStore.getState().settings?.theme).toBe("dark");
    resolveUpdate({ ...defaults, theme: "dark" });
    await expect(pending).resolves.toMatchObject({ theme: "dark" });
  });

  it("rolls back when IPC rejects", async () => {
    useSettingsStore.setState({ settings: defaults, status: "ready" });
    let rejectUpdate: (error: Error) => void = () => {};
    mockIPC((command) => command === "update_settings"
      ? new Promise<Settings>((_, reject) => { rejectUpdate = reject; })
      : undefined);
    const pending = useSettingsStore.getState().update({ theme: "dark" });
    expect(useSettingsStore.getState().settings?.theme).toBe("dark");
    rejectUpdate(new Error("disk"));
    await expect(pending).rejects.toThrow("disk");
    expect(useSettingsStore.getState().settings).toEqual(defaults);
  });
});
