import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import type { DocBase } from "@/features/editor/docState";
import { ipc } from "@/lib/ipc";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

const settings: Settings = {
  rootDir: null, lastExportDir: null, theme: "system", motion: "system", language: null, sidebarWidth: 260, editorSplitRatio: 50, editorLivePreview: true, backlinksExpanded: true,
  sidebarVisible: true, tabSizing: "fixed", contentWidth: "comfortable", openTabs: [], activeTab: null, expandedFolders: [], onboardingDone: false,
};
const ids = () => useTabsStore.getState().tabs.map((tab) => tab.noteId);
const base: DocBase = { html: "original", css: null, js: null, contentHash: "one" };
const doc = (id: string) => useTabsStore.getState().tabs.find((tab) => tab.noteId === id)?.doc;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(ipc, "clearPreviewDraft").mockResolvedValue();
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  useSettingsStore.setState({ settings, status: "ready" });
  useTabsStore.getState().restore(["a", "b", "c", "d"]);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  vi.useRealTimers();
});

describe("tabsStore", () => {
  it("opens singleton special tabs and toggles active ones closed", async () => {
    const store = useTabsStore.getState();
    store.openNote("a");
    store.openSpecial("settings");
    store.openSpecial("settings");
    store.toggleSpecial("trash");
    expect(ids()).toEqual(["a", "special:settings", "special:trash"]);
    store.toggleSpecial("settings");
    expect(useTabsStore.getState().activeId).toBe("special:settings");
    store.toggleSpecial("settings");
    expect(ids()).toEqual(["a", "special:trash"]);
    expect(useTabsStore.getState().activeId).toBe("special:trash");
    await store.close("special:trash");
    expect(useTabsStore.getState().activeId).toBe("a");
    await store.close("a");
    store.toggleSpecial("settings");
    store.toggleSpecial("settings");
    expect(ids()).toEqual([]);
    expect(useTabsStore.getState().activeId).toBeNull();
  });

  it("reorders and cycles special tabs without treating them as notes", async () => {
    const store = useTabsStore.getState();
    const reveal = vi.spyOn(useTreeStore.getState(), "revealNote");
    const guard = vi.fn(() => false);
    store.setBeforeCloseGuard(guard);
    store.openNote("special:settings");
    expect(ids()).toEqual([]);
    store.openSpecial("settings");
    store.openSpecial("trash");
    store.enterEdit("special:settings", base);
    store.updateDraft("special:settings", { html: "ignored" });
    expect(store.anyDirty()).toBe(false);
    store.move(1, 0);
    expect(ids()).toEqual(["special:trash", "special:settings"]);
    store.next();
    expect(useTabsStore.getState().activeId).toBe("special:settings");
    store.prev();
    expect(useTabsStore.getState().activeId).toBe("special:trash");
    store.replaceMissing([]);
    expect(ids()).toHaveLength(2);
    await store.closeOthers("special:settings");
    await store.close("special:settings");
    expect(guard).not.toHaveBeenCalled();
    expect(reveal).not.toHaveBeenCalled();
    expect(ipc.clearPreviewDraft).not.toHaveBeenCalled();
  });

  it("keeps dirty notes protected when closing other tabs from a special tab", async () => {
    const store = useTabsStore.getState();
    store.openNote("a");
    store.enterEdit("a", base);
    store.updateDraft("a", { html: "changed" });
    store.openSpecial("trash");
    store.openSpecial("settings");
    const closing = store.closeOthers("special:settings");
    await Promise.resolve();
    await Promise.resolve();
    expect(useUiStore.getState().unsavedDialog?.noteIds).toEqual(["a"]);
    useUiStore.getState().unsavedDialog?.resolve("cancel");
    await closing;
    expect(ids()).toEqual(["a", "special:trash", "special:settings"]);
    expect(store.isDirty("a")).toBe(true);
  });

  it("persists only notes even when a special tab is active", async () => {
    const update = vi.spyOn(useSettingsStore.getState(), "update").mockResolvedValue(settings);
    const store = useTabsStore.getState();
    store.openNote("a");
    store.openSpecial("settings");
    store.openNote("b", { activate: false });
    store.openSpecial("trash");
    await vi.advanceTimersByTimeAsync(500);
    expect(update).toHaveBeenLastCalledWith({ openTabs: ["a", "b"], activeTab: "a" });
    await store.close("a");
    await store.close("b");
    await vi.advanceTimersByTimeAsync(500);
    expect(update).toHaveBeenLastCalledWith({ openTabs: [], activeTab: null });
  });

  it("filters persisted special ids even if passed as existing ids", async () => {
    resetTabsStoreForTests();
    useSettingsStore.setState({ settings: { ...settings, openTabs: ["special:settings", "b", "special:trash"], activeTab: "special:trash" } });
    const update = vi.spyOn(useSettingsStore.getState(), "update").mockResolvedValue(settings);
    useTabsStore.getState().restore(["special:settings", "b", "special:trash"]);
    expect(ids()).toEqual(["b"]);
    expect(useTabsStore.getState().activeId).toBe("b");
    await vi.advanceTimersByTimeAsync(500);
    expect(update).toHaveBeenCalledWith({ openTabs: ["b"], activeTab: "b" });
  });

  it("preserves a special tab opened before the initial tree scan finishes", () => {
    resetTabsStoreForTests();
    useSettingsStore.setState({ settings: { ...settings, openTabs: ["a"], activeTab: "a" } });
    const store = useTabsStore.getState();
    store.openSpecial("settings");
    store.restore(["a"]);
    expect(ids()).toEqual(["a", "special:settings"]);
    expect(useTabsStore.getState().activeId).toBe("special:settings");
  });

  it("preserves an edited note opened before restoration alongside saved notes", () => {
    resetTabsStoreForTests();
    useSettingsStore.setState({ settings: { ...settings, openTabs: ["a", "b"], activeTab: "a" } });
    const store = useTabsStore.getState();
    store.openNote("b");
    store.enterEdit("b", base, "code");
    store.updateDraft("b", { html: "early edit" });
    store.restore(["a", "b"]);
    expect(ids()).toEqual(["a", "b"]);
    expect(useTabsStore.getState().activeId).toBe("b");
    expect(doc("b")).toMatchObject({ mode: "code", dirty: true, draft: { html: "early edit" } });
  });

  it("initializes document state for opened and restored tabs", () => {
    useTabsStore.getState().openNote("a");
    expect(doc("a")).toMatchObject({ mode: "view", base: null, draft: null, dirty: false });
    resetTabsStoreForTests();
    useSettingsStore.setState({ settings: { ...settings, openTabs: ["a"] } });
    useTabsStore.getState().restore(["a"]);
    expect(doc("a")).toMatchObject({ mode: "view", base: null, draft: null, dirty: false });
  });

  it("applies document transitions and tracks dirty across tabs and closure", async () => {
    const store = useTabsStore.getState();
    store.openNote("a"); store.openNote("b");
    expect(store.isDirty("missing")).toBe(false);
    expect(store.anyDirty()).toBe(false);
    store.enterEdit("a", base, "code");
    store.switchMode("a", "visual");
    store.updateDraft("a", { html: "edited" });
    expect(doc("a")).toMatchObject({ mode: "visual", dirty: true });
    expect(store.isDirty("a")).toBe(true);
    expect(store.isDirty("b")).toBe(false);
    expect(store.anyDirty()).toBe(true);
    store.markSaving("a");
    store.saveFailed("a");
    expect(doc("a")).toMatchObject({ saving: false, dirty: true });
    store.markSaving("a");
    store.saveSucceeded("a", { ...base, html: "edited" }, 42);
    expect(doc("a")).toMatchObject({ saving: false, dirty: false, lastSavedAt: 42 });
    store.updateDraft("b", { html: "ignored" });
    store.enterEdit("b", base);
    store.updateDraft("b", { html: "other" });
    store.reloadBase("b", { ...base, contentHash: "two" });
    expect(doc("b")).toMatchObject({ dirty: true, draft: { html: "other" } });
    store.cancelEdit("a");
    expect(doc("a")).toMatchObject({ mode: "view", draft: null, dirty: false });
    expect(store.anyDirty()).toBe(true);
    const closing = store.close("b");
    await Promise.resolve();
    useUiStore.getState().unsavedDialog?.resolve("discard");
    await closing;
    expect(store.isDirty("b")).toBe(false);
    expect(store.anyDirty()).toBe(false);
  });

  it("opens once, reveals notes, and respects inactive opens", () => {
    useTreeStore.setState({ tree: [
      { type: "note", id: "a", title: "A", relPath: "A", isFavorite: false, tags: [], updatedAt: "" },
      { type: "note", id: "b", title: "B", relPath: "B", isFavorite: false, tags: [], updatedAt: "" },
    ] });
    const store = useTabsStore.getState();
    store.openNote("a");
    expect(useTreeStore.getState().selected).toEqual({ kind: "note", id: "a" });
    store.openNote("b", { activate: false });
    expect(ids()).toEqual(["a", "b"]);
    expect(useTabsStore.getState().activeId).toBe("a");
    expect(useTreeStore.getState().selected).toEqual({ kind: "note", id: "a" });
    store.openNote("b", { activate: false });
    expect(useTabsStore.getState().activeId).toBe("a");
    expect(useTreeStore.getState().selected).toEqual({ kind: "note", id: "a" });
    store.openNote("b");
    expect(ids()).toEqual(["a", "b"]);
    expect(useTabsStore.getState().activeId).toBe("b");
    expect(useTreeStore.getState().selected).toEqual({ kind: "note", id: "b" });
  });

  it("leaves active and tree selection empty for a background first tab", () => {
    useTabsStore.getState().openNote("a", { activate: false });
    expect(ids()).toEqual(["a"]);
    expect(useTabsStore.getState().activeId).toBeNull();
    expect(useTreeStore.getState().selected).toBeNull();
  });

  it("closes active tabs to the right, then left, then none", async () => {
    const store = useTabsStore.getState();
    for (const id of ["a", "b", "c"]) store.openNote(id);
    store.activate("b");
    expect(await store.close("b")).toBe(true);
    expect(useTabsStore.getState().activeId).toBe("c");
    expect(await store.close("c")).toBe(true);
    expect(useTabsStore.getState().activeId).toBe("a");
    expect(await store.close("a")).toBe(true);
    expect(useTabsStore.getState().activeId).toBeNull();
    expect(await store.close("missing")).toBe(false);
  });

  it("keeps active selection when closing an inactive tab", async () => {
    const store = useTabsStore.getState();
    store.openNote("a"); store.openNote("b");
    await store.close("a");
    expect(useTabsStore.getState().activeId).toBe("b");
    store.activate("missing");
    expect(useTabsStore.getState().activeId).toBe("b");
  });

  it("navigates cyclically and moves within clamped bounds", () => {
    const store = useTabsStore.getState();
    for (const id of ["a", "b", "c"]) store.openNote(id);
    store.next(); expect(useTabsStore.getState().activeId).toBe("a");
    store.prev(); expect(useTabsStore.getState().activeId).toBe("c");
    store.move(0, 99); expect(ids()).toEqual(["b", "c", "a"]);
    store.move(2, -5); expect(ids()).toEqual(["a", "b", "c"]);
    store.move(-1, 1); store.move(1, 1); store.move(1, Number.NaN);
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(useTabsStore.getState().activeId).toBe("c");
  });

  it("closes others while keeping guard vetoes", async () => {
    const clear = vi.spyOn(ipc, "clearPreviewDraft").mockResolvedValue();
    const store = useTabsStore.getState();
    for (const id of ["a", "b", "c"]) store.openNote(id);
    const unregister = store.setBeforeCloseGuard((id) => id !== "a");
    await store.closeOthers("b");
    expect(ids()).toEqual(["a", "b"]);
    expect(useTabsStore.getState().activeId).toBe("b");
    expect(clear).toHaveBeenCalledWith("c");
    expect(clear).not.toHaveBeenCalledWith("a");
    expect(await store.close("a")).toBe(false);
    unregister();
    expect(await store.close("a")).toBe(true);
    expect(clear).toHaveBeenCalledWith("a");
  });

  it("prompts once for dirty closeOthers and keeps a failed save open", async () => {
    const store = useTabsStore.getState();
    for (const id of ["a", "b", "c"]) {
      store.openNote(id);
      if (id !== "b") {
        store.enterEdit(id, base, "code");
        store.updateDraft(id, { html: `changed ${id}` });
      }
    }
    store.openNote("d");
    mockIPC((command, args) => {
      if (command === "save_note" && (args as { id: string }).id === "c") throw { code: "IO_ERROR" };
      if (command === "save_note") return { contentHash: "new" };
    });
    const closing = store.closeOthers("b");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(useUiStore.getState().unsavedDialog?.noteIds).toEqual(["a", "c"]);
    useUiStore.getState().unsavedDialog?.resolve("save");
    await closing;
    expect(ids()).toEqual(["b", "c"]);
    expect(store.isDirty("c")).toBe(true);
  });

  it("keeps every candidate and the active tab on a cancelled batch close", async () => {
    const store = useTabsStore.getState();
    for (const id of ["a", "b", "c"]) store.openNote(id);
    store.enterEdit("a", base, "code");
    store.updateDraft("a", { html: "changed" });
    store.activate("c");
    const closing = store.closeOthers("b");
    await Promise.resolve();
    await Promise.resolve();
    expect(useUiStore.getState().unsavedDialog?.noteIds).toEqual(["a"]);
    useUiStore.getState().unsavedDialog?.resolve("cancel");
    await closing;
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(store.isDirty("a")).toBe(true);
    expect(useTabsStore.getState().activeId).toBe("c");
  });

  it("closes dirty and clean candidates after one discard decision", async () => {
    const store = useTabsStore.getState();
    for (const id of ["a", "b", "c"]) store.openNote(id);
    store.enterEdit("a", base, "code");
    store.updateDraft("a", { html: "changed" });
    mockIPC(() => undefined);
    const closing = store.closeOthers("b");
    await Promise.resolve();
    await Promise.resolve();
    useUiStore.getState().unsavedDialog?.resolve("discard");
    await closing;
    expect(ids()).toEqual(["b"]);
    expect(useTabsStore.getState().activeId).toBe("b");
  });

  it("waits for an asynchronous close guard", async () => {
    const store = useTabsStore.getState();
    store.openNote("a");
    store.setBeforeCloseGuard(async () => false);
    expect(await store.close("a")).toBe(false);
    expect(ids()).toEqual(["a"]);
  });

  it("removes missing tabs using the close selection rule", () => {
    const clear = vi.spyOn(ipc, "clearPreviewDraft").mockResolvedValue();
    const store = useTabsStore.getState();
    for (const id of ["a", "b", "c", "d"]) store.openNote(id);
    store.activate("b");
    store.replaceMissing(["a", "c"]);
    expect(ids()).toEqual(["a", "c"]);
    expect(useTabsStore.getState().activeId).toBe("c");
    expect(clear).toHaveBeenCalledWith("b");
    expect(clear).toHaveBeenCalledWith("d");
    store.replaceMissing([]);
    expect(useTabsStore.getState().activeId).toBeNull();
  });

  it("debounces persistence of the final state", async () => {
    const updates: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "update_settings") {
        updates.push(args);
        return { ...settings, openTabs: ["a", "b"], activeTab: "a" };
      }
      return undefined;
    });
    const store = useTabsStore.getState();
    store.openNote("a"); store.openNote("b"); store.activate("a");
    await vi.advanceTimersByTimeAsync(499);
    expect(updates).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(updates).toEqual([{ patch: { openTabs: ["a", "b"], activeTab: "a" } }]);
  });

  it("restores ordered known tabs and repairs the active id", () => {
    resetTabsStoreForTests();
    useSettingsStore.setState({ settings: { ...settings, openTabs: ["b", "gone", "a", "b"], activeTab: "gone" } });
    const store = useTabsStore.getState();
    store.restore(["a", "b"]);
    expect(ids()).toEqual(["b", "a"]);
    expect(useTabsStore.getState().activeId).toBe("b");
    store.restore([]);
    expect(ids()).toEqual(["b", "a"]);
  });

  it("persists filtered tabs and a valid active id after restore", async () => {
    resetTabsStoreForTests();
    useSettingsStore.setState({ settings: { ...settings, openTabs: ["b", "gone", "a"], activeTab: "gone" } });
    const update = vi.spyOn(useSettingsStore.getState(), "update").mockResolvedValue(settings);

    useTabsStore.getState().restore(["a", "b"]);
    expect(useTabsStore.getState().restored).toBe(true);
    await vi.advanceTimersByTimeAsync(499);
    expect(update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(update).toHaveBeenCalledExactlyOnceWith({ openTabs: ["b", "a"], activeTab: "b" });
    update.mockRestore();
  });

  it("does not overwrite saved tabs before restoration", async () => {
    resetTabsStoreForTests();
    const update = vi.spyOn(useSettingsStore.getState(), "update");
    useTabsStore.getState().openNote("a");
    await vi.advanceTimersByTimeAsync(500);
    expect(update).not.toHaveBeenCalled();
    update.mockRestore();
  });
});
