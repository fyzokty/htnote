import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Settings, TreeNode } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";

const note: TreeNode = { type: "note", id: "n", title: "Başlık", relPath: "A/B/Not", isFavorite: false, tags: [], updatedAt: "" };
const tree: TreeNode[] = [{ type: "folder", name: "A", relPath: "A", children: [
  { type: "folder", name: "B", relPath: "A/B", children: [note] },
] }];
const settings: Settings = { rootDir: null, lastExportDir: null, theme: "system", language: null, sidebarWidth: 260, editorSplitRatio: 50, editorLivePreview: true, backlinksExpanded: true, sidebarVisible: true, tabSizing: "fixed", contentWidth: "comfortable", openTabs: [], activeTab: null, expandedFolders: ["A"], onboardingDone: false };

beforeEach(() => {
  vi.useRealTimers();
  resetTreeStoreForTests();
  useSettingsStore.setState({ settings: null, status: "idle" });
});

describe("treeStore", () => {
  it("moves expanded paths and folder selection after rename", () => {
    useTreeStore.setState({ tree, expanded: new Set(["A", "A/B"]), selected: { kind: "folder", relPath: "A/B" } });
    useTreeStore.getState().movePathPrefix("A", "Renamed");
    expect([...useTreeStore.getState().expanded]).toEqual(["Renamed", "Renamed/B"]);
    expect(useTreeStore.getState().selected).toEqual({ kind: "folder", relPath: "Renamed/B" });
  });
  it("seeds saved expansion when refresh is the first tree request", async () => {
    useSettingsStore.setState({ settings, status: "ready" });
    mockIPC((command) => command === "get_note_tree" ? tree : undefined);
    await useTreeStore.getState().refresh();
    expect([...useTreeStore.getState().expanded]).toEqual(["A"]);
    useTreeStore.getState().toggle("A");
    await useTreeStore.getState().refresh();
    expect([...useTreeStore.getState().expanded]).toEqual([]);
  });

  it("coalesces refresh calls during load into one fresh request", async () => {
    let release!: (nodes: TreeNode[]) => void;
    const pending = new Promise<TreeNode[]>((resolve) => { release = resolve; });
    let calls = 0;
    mockIPC((command) => {
      if (command === "get_note_tree") { calls++; return calls === 1 ? pending : []; }
      return undefined;
    });
    const first = useTreeStore.getState().load();
    const second = useTreeStore.getState().load();
    const refresh = useTreeStore.getState().refresh();
    const anotherRefresh = useTreeStore.getState().refresh();
    expect(second).toBe(first);
    expect(refresh).toBe(anotherRefresh);
    expect(useTreeStore.getState().loading).toBe(true);
    release(tree);
    await Promise.all([first, second, refresh]);
    expect(calls).toBe(2);
    expect(useTreeStore.getState().tree).toEqual([]);
    expect(useTreeStore.getState().loading).toBe(false);
  });

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

  it("unites folders opened before settings arrive and seeds only once", async () => {
    const updates: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "get_note_tree") return tree;
      if (command === "update_settings") {
        updates.push(args);
        return { ...settings, expandedFolders: ["A", "A/B"] };
      }
      return undefined;
    });
    await useTreeStore.getState().load();
    vi.useFakeTimers();
    useTreeStore.getState().toggle("A");
    useTreeStore.getState().toggle("A/B");
    await vi.advanceTimersByTimeAsync(500);
    expect(updates).toHaveLength(0);
    useSettingsStore.setState({ settings: { ...settings, expandedFolders: ["A"] }, status: "ready" });
    expect([...useTreeStore.getState().expanded]).toEqual(["A", "A/B"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(updates).toEqual([{ patch: { expandedFolders: ["A", "A/B"] } }]);
    useTreeStore.getState().toggle("A");
    useSettingsStore.setState({ settings: { ...settings, expandedFolders: ["A"] }, status: "ready" });
    await useTreeStore.getState().refresh();
    expect([...useTreeStore.getState().expanded]).toEqual(["A/B"]);
    vi.useRealTimers();
  });

  it("persists normalized late settings even without user expansion", async () => {
    const updates: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "get_note_tree") return tree;
      if (command === "update_settings") { updates.push(args); return { ...settings, expandedFolders: ["A"] }; }
      return undefined;
    });
    await useTreeStore.getState().load();
    vi.useFakeTimers();
    useSettingsStore.setState({ settings: { ...settings, expandedFolders: ["A", "A", "deleted"] }, status: "ready" });
    expect([...useTreeStore.getState().expanded]).toEqual(["A"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(updates).toEqual([{ patch: { expandedFolders: ["A"] } }]);
    vi.useRealTimers();
  });

  it("refresh before late settings prunes deleted nodes without seeding saved folders", async () => {
    let nodes = tree;
    mockIPC((command) => command === "get_note_tree" ? nodes : undefined);
    await useTreeStore.getState().load();
    useTreeStore.getState().toggle("A/B");
    useTreeStore.getState().select({ kind: "note", id: "n" });
    nodes = [{ type: "folder", name: "A", relPath: "A", children: [] }];
    await useTreeStore.getState().refresh();
    expect([...useTreeStore.getState().expanded]).toEqual([]);
    expect(useTreeStore.getState().selected).toBeNull();
    useSettingsStore.setState({ settings: { ...settings, expandedFolders: ["A/B"] }, status: "ready" });
    expect([...useTreeStore.getState().expanded]).toEqual([]);
    await useTreeStore.getState().refresh();
    expect([...useTreeStore.getState().expanded]).toEqual([]);
  });

  it("flashes a node key and clears it after duration timer", () => {
    vi.useFakeTimers();
    expect(useTreeStore.getState().flashedKey).toBeNull();

    useTreeStore.getState().flashNode("note:n", 1000);
    expect(useTreeStore.getState().flashedKey).toBe("note:n");

    vi.advanceTimersByTime(999);
    expect(useTreeStore.getState().flashedKey).toBe("note:n");

    vi.advanceTimersByTime(1);
    expect(useTreeStore.getState().flashedKey).toBeNull();

    // Custom duration and override
    useTreeStore.getState().flashNode("folder:A", 500);
    expect(useTreeStore.getState().flashedKey).toBe("folder:A");
    useTreeStore.getState().flashNode("folder:B", 300);
    expect(useTreeStore.getState().flashedKey).toBe("folder:B");

    vi.advanceTimersByTime(299);
    expect(useTreeStore.getState().flashedKey).toBe("folder:B");
    vi.advanceTimersByTime(1);
    expect(useTreeStore.getState().flashedKey).toBeNull();

    vi.useRealTimers();
  });
});
