import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/app/AppShell";
import type { Settings, SettingsPatch } from "@/lib/types";
import { resetSettingsQueueForTests, useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

vi.mock("@/features/tree/SidebarTree", () => ({ SidebarTree: () => null }));
vi.mock("@/features/tabs/TabBar", () => ({ TabBar: () => null }));
vi.mock("@/features/viewer/NoteViewer", () => ({ NoteViewer: () => null }));
vi.mock("@/features/viewer/bridgeHost", () => ({ installBridgeHost: () => () => {} }));
vi.mock("@/features/tree/fsChangeSync", () => ({ startFsChangeSync: () => () => {} }));
vi.mock("@/features/tree/useTreeActions", () => ({ useTreeActions: () => ({ createNote: vi.fn(), createFolder: vi.fn() }) }));
vi.mock("@/lib/shortcuts/manager", () => ({ installShortcutListener: () => () => {}, scheduleUnboundShortcutWarnings: () => () => {} }));
vi.mock("@/lib/shortcuts/useShortcut", () => ({ useShortcut: () => {} }));

const baseSettings: Settings = {
  rootDir: null,
  lastExportDir: null,
  theme: "system",
  language: null,
  sidebarWidth: 260,
  sidebarVisible: true,
  tabSizing: "fixed",
  contentWidth: "comfortable",
  editorSplitRatio: 50,
  editorLivePreview: true,
  backlinksExpanded: true,
  openTabs: [],
  activeTab: null,
  expandedFolders: [],
  onboardingDone: false,
};

describe("AppShell sidebar resizing", () => {
  beforeEach(() => {
    resetSettingsQueueForTests();
    resetTabsStoreForTests();
    useUiStore.setState({ unsavedDialog: null, toasts: [] });
    useTreeStore.setState({ tree: [], load: async () => {} });
    useSettingsStore.setState({ settings: { ...baseSettings }, status: "ready" });
  });

  it("updates width optimistically on pointer release and sends sidebarWidth patch", async () => {
    let sentPatch: SettingsPatch | null = null;
    mockIPC((command, args) => {
      if (command === "update_settings") {
        sentPatch = (args as { patch: SettingsPatch }).patch;
        return { ...baseSettings, ...sentPatch };
      }
      if (command === "list_drafts") return [];
      return undefined;
    });

    render(<AppShell />);
    const separator = screen.getByRole("separator", { name: "Kenar çubuğunu yeniden boyutlandır" });
    const aside = screen.getByRole("complementary", { name: "Kenar çubuğu" });
    expect(aside).toHaveStyle({ width: "260px" });

    // Start resize
    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 260 });

    // Drag to 320
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 320 });
    expect(aside).toHaveStyle({ width: "320px" });

    // Finish resize
    await act(async () => {
      fireEvent.pointerUp(separator, { pointerId: 1 });
    });

    // Remains at 320 and store is updated
    expect(aside).toHaveStyle({ width: "320px" });
    expect(useSettingsStore.getState().settings?.sidebarWidth).toBe(320);
    expect(sentPatch).toEqual({ sidebarWidth: 320 });
  });

  it("clamps resize width between 200 and 480", async () => {
    mockIPC((command, args) => {
      if (command === "update_settings") {
        return { ...baseSettings, ...(args as { patch: SettingsPatch }).patch };
      }
      if (command === "list_drafts") return [];
      return undefined;
    });

    render(<AppShell />);
    const separator = screen.getByRole("separator", { name: "Kenar çubuğunu yeniden boyutlandır" });
    const aside = screen.getByRole("complementary", { name: "Kenar çubuğu" });

    // Drag below minimum (150px)
    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 260 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 150 });
    expect(aside).toHaveStyle({ width: "200px" });

    await act(async () => {
      fireEvent.pointerUp(separator, { pointerId: 1 });
    });
    expect(useSettingsStore.getState().settings?.sidebarWidth).toBe(200);

    // Drag above maximum (600px)
    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 600 });
    expect(aside).toHaveStyle({ width: "480px" });

    await act(async () => {
      fireEvent.pointerUp(separator, { pointerId: 1 });
    });
    expect(useSettingsStore.getState().settings?.sidebarWidth).toBe(480);
  });
});
