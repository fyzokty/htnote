import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/app/AppShell";
import type { Settings, SettingsPatch } from "@/lib/types";
import { resetSettingsQueueForTests, useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

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
  theme: "system", motion: "off",
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
    localStorage.clear();
    resetSettingsQueueForTests();
    resetTabsStoreForTests();
    useUiStore.setState({ unsavedDialog: null, toasts: [], searchOpen: false, sidebarVisible: true });
    useTreeStore.setState({ tree: [], load: async () => {} });
    useSettingsStore.setState({ settings: { ...baseSettings }, status: "ready" });
  });

  it("keeps tags before the footer and the closed folders section flexible", () => {
    mockIPC((command) => command === "list_drafts" ? [] : undefined);
    useTreeStore.setState({ tree: [{ type: "note", id: "layout", title: "Layout", relPath: "Layout", isFavorite: false, tags: ["tag"], updatedAt: "" }] });
    render(<AppShell />);
    const heading = screen.getByTestId("folders-toggle");
    const folders = heading.closest("section")!;
    const tags = screen.getByTestId("tags-toggle").parentElement!;
    const footer = screen.getByTestId("trash").parentElement!;
    fireEvent.click(heading);
    expect(heading).toHaveAttribute("aria-expanded", "false");
    expect(folders).toHaveClass("flex-1", "min-h-0");
    expect(folders.nextElementSibling).toBe(tags);
    expect(tags).toHaveClass("htnote-tags-section");
    expect(tags).toHaveAttribute("data-expanded", "true");
    fireEvent.click(screen.getByTestId("tags-toggle"));
    expect(tags).toHaveAttribute("data-expanded", "false");
    expect(tags.parentElement!.nextElementSibling).toBe(footer);
    expect(footer).toHaveClass("mt-auto", "shrink-0");
    expect(screen.getByRole("complementary")).not.toHaveClass("overflow-y-auto");
  });

  it("orders the single-row actions and opens search with an icon-only button", () => {
    mockIPC((command) => command === "list_drafts" ? [] : undefined);
    const { container } = render(<AppShell />);
    const actions = container.querySelector(".htnote-sidebar-actions")!;
    expect([...actions.querySelectorAll("button")].map((button) => button.dataset.testid)).toEqual(["new-note", "new-folder", "global-search"]);
    const search = screen.getByTestId("global-search");
    expect(search).toHaveAttribute("aria-label", "Ara");
    expect(search.textContent).toBe("");
    expect(search.querySelector("svg")).not.toBeNull();
    expect(actions.querySelector("kbd")).toBeNull();
    fireEvent.click(search);
    expect(useUiStore.getState().searchOpen).toBe(true);
  });

  it("shows shortcuts in all sidebar action tooltips while keeping buttons free of badges", () => {
    mockIPC((command) => command === "list_drafts" ? [] : undefined);
    render(<AppShell />);
    for (const [id, shortcut] of [["new-note", "Ctrl+N"], ["new-folder", "Ctrl+Shift+N"], ["global-search", "Ctrl+Shift+F"]]) {
      const button = screen.getByTestId(id);
      expect(button.querySelector("kbd")).toBeNull();
      vi.spyOn(button.parentElement!, "getBoundingClientRect").mockReturnValue({ width: 28, height: 28, left: 0, top: 0, bottom: 28 } as DOMRect);
      vi.spyOn(button, "matches").mockImplementation((selector) => selector === ":focus-visible");
      act(() => button.focus());
      expect(screen.getByRole("tooltip").querySelector("kbd")).toHaveTextContent(shortcut);
      act(() => button.blur());
    }
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

  it("uses the sidebar offset for overlay dragging and preserves the width when hidden", async () => {
    let persisted = { ...baseSettings };
    mockIPC((command, args) => {
      if (command === "update_settings") {
        persisted = { ...persisted, ...(args as { patch: SettingsPatch }).patch };
        return persisted;
      }
      if (command === "list_drafts") return [];
      return undefined;
    });

    const { container } = render(<AppShell />);
    const aside = screen.getByRole("complementary", { name: "Kenar çubuğu" });
    vi.spyOn(aside, "getBoundingClientRect").mockReturnValue({ left: 8 } as DOMRect);
    const separator = screen.getByRole("separator", { name: "Kenar çubuğunu yeniden boyutlandır" });
    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 268 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 308 });
    expect(aside).toHaveStyle({ width: "300px" });

    const overlay = container.querySelector(".fixed.inset-0.cursor-col-resize");
    expect(overlay).not.toBeNull();
    fireEvent.pointerMove(overlay!, { pointerId: 1, clientX: 328 });
    expect(aside).toHaveStyle({ width: "320px" });
    await act(async () => {
      fireEvent.pointerUp(overlay!, { pointerId: 1 });
    });
    expect(persisted.sidebarWidth).toBe(320);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kenar çubuğunu gizle" }));
    });
    expect(screen.queryByRole("complementary", { name: "Kenar çubuğu" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kenar çubuğunu göster" }));
    });
    expect(screen.getByRole("complementary", { name: "Kenar çubuğu" })).toHaveStyle({ width: "320px" });
  });
});

it("persists compact width last after two pointer presses, including stale drag events", async () => {
  resetSettingsQueueForTests();
  resetTabsStoreForTests();
  useUiStore.setState({ unsavedDialog: null, toasts: [], sidebarVisible: true });
  useTreeStore.setState({ tree: [], load: async () => {} });
  useSettingsStore.setState({ settings: { ...baseSettings }, status: "ready" });
  const updateSettings = vi.spyOn(useSettingsStore.getState(), "update");
  const patches: SettingsPatch[] = [];
  let persisted = { ...baseSettings };
  mockIPC((command, args) => {
    if (command === "update_settings") {
      const patch = (args as { patch: SettingsPatch }).patch;
      patches.push(patch);
      persisted = { ...persisted, ...patch };
      return persisted;
    }
    if (command === "list_drafts") return [];
    return undefined;
  });
  render(<AppShell />);
  const separator = screen.getByRole("separator");
  const aside = screen.getByRole("complementary", { name: "Kenar çubuğu" });
  fireEvent.pointerDown(separator, { pointerId: 1, detail: 1, clientX: 260 });
  fireEvent.pointerMove(separator, { pointerId: 1, clientX: 320 });
  await act(async () => { fireEvent.pointerUp(separator, { pointerId: 1 }); });
  await act(async () => {
    fireEvent.pointerDown(separator, { pointerId: 1, detail: 2, clientX: 320 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 400 });
    fireEvent.pointerUp(separator, { pointerId: 1 });
  });
  expect(aside).toHaveStyle({ width: "200px" });
  expect(updateSettings).toHaveBeenLastCalledWith({ sidebarWidth: 200 });
  expect(patches[patches.length - 1]).toEqual({ sidebarWidth: 200 });
  // Yerel PointerEvent detail=0 üreten tarayıcılar dblclick ile aynı sonucu alır.
  await act(async () => {
    fireEvent.pointerDown(separator, { pointerId: 2, detail: 0, clientX: 200 });
    fireEvent.pointerUp(separator, { pointerId: 2 });
    fireEvent.doubleClick(separator);
  });
  expect(updateSettings).toHaveBeenLastCalledWith({ sidebarWidth: 200 });
  expect(aside).toHaveStyle({ width: "200px" });
});
