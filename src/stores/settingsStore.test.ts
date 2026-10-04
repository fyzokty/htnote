import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Settings } from "@/lib/types";
import { resetSettingsQueueForTests, useSettingsStore } from "@/stores/settingsStore";

const defaults: Settings = {
  rootDir: null, lastExportDir: null,
  theme: "system", motion: "system",
  language: null,
  sidebarWidth: 260, editorSplitRatio: 50, editorLivePreview: true,
  sidebarVisible: true, tabSizing: "fixed",
  contentWidth: "comfortable",
  backlinksExpanded: true,
  openTabs: [],
  activeTab: null,
  expandedFolders: [],
  onboardingDone: false,
};

beforeEach(() => {
  resetSettingsQueueForTests();
  useSettingsStore.setState({ settings: null, status: "idle" });
});

describe("settingsStore", () => {
  it("keeps a third update queued when the first finishes while the second is pending", async () => {
    useSettingsStore.setState({ settings: defaults, status: "ready" });
    const resolvers: ((settings: Settings) => void)[] = [];
    mockIPC((command) => command === "update_settings"
      ? new Promise<Settings>((resolve) => { resolvers.push(resolve); })
      : undefined);

    const first = useSettingsStore.getState().update({ sidebarWidth: 350 });
    const second = useSettingsStore.getState().update({ theme: "dark" });
    expect(resolvers).toHaveLength(1);
    resolvers[0]({ ...defaults, sidebarWidth: 350 });
    await first;
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));

    const third = useSettingsStore.getState().update({ language: "tr" });
    // Drain microtasks so an incorrectly concurrent third request also reaches IPC.
    await Promise.resolve();
    expect(resolvers).toHaveLength(2);
    expect(useSettingsStore.getState().settings).toMatchObject({ sidebarWidth: 350, theme: "dark", language: "tr" });

    resolvers[1]({ ...defaults, sidebarWidth: 350, theme: "dark" });
    await second;
    await vi.waitFor(() => expect(resolvers).toHaveLength(3));
    expect(useSettingsStore.getState().settings?.language).toBe("tr");
    const saved: Settings = { ...defaults, sidebarWidth: 350, theme: "dark", language: "tr" };
    resolvers[2](saved);
    await third;
    expect(useSettingsStore.getState().settings).toEqual(saved);
  });

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

  it("serializes concurrent updates and prevents earlier responses from overwriting newer optimistic updates", async () => {
    useSettingsStore.setState({ settings: defaults, status: "ready" });
    let resolveFirst!: (settings: Settings) => void;
    const firstPromise = new Promise<Settings>((resolve) => { resolveFirst = resolve; });
    let resolveSecond!: (settings: Settings) => void;
    const secondPromise = new Promise<Settings>((resolve) => { resolveSecond = resolve; });

    let callCount = 0;
    mockIPC((command) => {
      if (command === "update_settings") {
        callCount++;
        return callCount === 1 ? firstPromise : secondPromise;
      }
      return undefined;
    });

    const update1 = useSettingsStore.getState().update({ sidebarWidth: 350 });
    const update2 = useSettingsStore.getState().update({ openTabs: ["note-1"] });

    // Store immediately has both updates optimistically
    expect(useSettingsStore.getState().settings?.sidebarWidth).toBe(350);
    expect(useSettingsStore.getState().settings?.openTabs).toEqual(["note-1"]);

    // First call resolves on server (which only processed patch1, so openTabs on server was still [])
    resolveFirst({ ...defaults, sidebarWidth: 350, openTabs: [] });
    await update1;

    // Crucial assertion: store must NOT have reverted openTabs to []!
    expect(useSettingsStore.getState().settings?.sidebarWidth).toBe(350);
    expect(useSettingsStore.getState().settings?.openTabs).toEqual(["note-1"]);

    // Second call resolves on server (which processed patch2 on top of patch1)
    resolveSecond({ ...defaults, sidebarWidth: 350, openTabs: ["note-1"] });
    await update2;

    expect(useSettingsStore.getState().settings?.sidebarWidth).toBe(350);
    expect(useSettingsStore.getState().settings?.openTabs).toEqual(["note-1"]);
  });
});
