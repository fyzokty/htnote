import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Settings, TreeNode } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";

const note: TreeNode = { type: "note", id: "n", title: "Başlık", relPath: "A/B/Not", isFavorite: false, tags: [], updatedAt: "" };
const tree: TreeNode[] = [{ type: "folder", name: "A", relPath: "A", children: [
  { type: "folder", name: "B", relPath: "A/B", children: [note] },
] }];
const settings: Settings = { rootDir: null, theme: "system", language: null, sidebarWidth: 260, sidebarVisible: true, openTabs: [], activeTab: null, expandedFolders: ["A"] };

beforeEach(() => {
  vi.useRealTimers();
  resetTreeStoreForTests();
  useSettingsStore.setState({ settings: null, status: "idle" });
});

describe("treeStore", () => {
  it("loads saved expansion and preserves valid selection on refresh", async () => {
    useSettingsStore.setState({ settings, status: "ready" });
    mockIPC((command) => command === "get_note_tree" ? tree : undefined);
    await useTreeStore.getState().load();
    expect([...useTreeStore.getState().expanded]).toEqual(["A"]);
    useTreeStore.getState().select({ kind: "note", id: "n" });
    await useTreeStore.getState().refresh();
    expect(useTreeStore.getState().selected).toEqual({ kind: "note", id: "n" });
    expect([...useTreeStore.getState().expanded]).toEqual(["A"]);
  });

  it("prunes missing folders and selection on refresh", async () => {
    useSettingsStore.setState({ settings, status: "ready" });
    let nodes = tree;
    mockIPC((command) => command === "get_note_tree" ? nodes : undefined);
    await useTreeStore.getState().load();
    useTreeStore.getState().select({ kind: "folder", relPath: "A" });
    nodes = [];
    await useTreeStore.getState().refresh();
    expect(useTreeStore.getState().selected).toBeNull();
    expect(useTreeStore.getState().expanded.size).toBe(0);
  });

  it("reveals deep notes and lists note metadata", async () => {
    mockIPC((command) => command === "get_note_tree" ? tree : undefined);
    await useTreeStore.getState().load();
    expect(useTreeStore.getState().findNoteById("n")).toEqual(note);
    expect(useTreeStore.getState().findNoteById("missing")).toBeNull();
    expect(useTreeStore.getState().flatNotes()).toEqual([{ id: "n", title: "Başlık", relPath: "A/B/Not" }]);
    useTreeStore.getState().revealNote("n");
    expect([...useTreeStore.getState().expanded]).toEqual(["A", "A/B"]);
    expect(useTreeStore.getState().selected).toEqual({ kind: "note", id: "n" });
  });

  it("toggles with new Sets and saves the final expansion once after 500 ms", async () => {
    useSettingsStore.setState({ settings: { ...settings, expandedFolders: [] }, status: "ready" });
    const updates: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "get_note_tree") return tree;
      if (command === "update_settings") { updates.push(args); return { ...settings, expandedFolders: ["A/B"] }; }
      return undefined;
    });
    await useTreeStore.getState().load();
    vi.useFakeTimers();
    const previous = useTreeStore.getState().expanded;
    useTreeStore.getState().toggle("A");
    useTreeStore.getState().toggle("A");
    useTreeStore.getState().toggle("A/B");
    expect(useTreeStore.getState().expanded).not.toBe(previous);
    await vi.advanceTimersByTimeAsync(499);
    expect(updates).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ patch: { expandedFolders: ["A/B"] } });
    vi.useRealTimers();
  });
});
