import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import type { DocBase } from "@/features/editor/docState";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";

const settings: Settings = {
  rootDir: null, theme: "system", language: null, sidebarWidth: 260,
  sidebarVisible: true, openTabs: [], activeTab: null, expandedFolders: [], onboardingDone: false,
};
const ids = () => useTabsStore.getState().tabs.map((tab) => tab.noteId);
const base: DocBase = { html: "original", css: null, js: null, contentHash: "one" };
const doc = (id: string) => useTabsStore.getState().tabs.find((tab) => tab.noteId === id)?.doc;

beforeEach(() => {
  vi.useFakeTimers();
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  useSettingsStore.setState({ settings, status: "ready" });
  useTabsStore.getState().restore(["a", "b", "c", "d"]);
});

afterEach(() => {
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  vi.useRealTimers();
});

describe("tabsStore", () => {
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
    await store.close("b");
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
    const store = useTabsStore.getState();
    for (const id of ["a", "b", "c"]) store.openNote(id);
    const unregister = store.setBeforeCloseGuard((id) => id !== "a");
    await store.closeOthers("b");
    expect(ids()).toEqual(["a", "b"]);
    expect(useTabsStore.getState().activeId).toBe("b");
    expect(await store.close("a")).toBe(false);
    unregister();
    expect(await store.close("a")).toBe(true);
  });

  it("waits for an asynchronous close guard", async () => {
    const store = useTabsStore.getState();
    store.openNote("a");
    store.setBeforeCloseGuard(async () => false);
    expect(await store.close("a")).toBe(false);
    expect(ids()).toEqual(["a"]);
  });

  it("removes missing tabs using the close selection rule", () => {
    const store = useTabsStore.getState();
    for (const id of ["a", "b", "c", "d"]) store.openNote(id);
    store.activate("b");
    store.replaceMissing(["a", "c"]);
    expect(ids()).toEqual(["a", "c"]);
    expect(useTabsStore.getState().activeId).toBe("c");
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
