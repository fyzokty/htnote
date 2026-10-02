import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it } from "vitest";

import { createDocState } from "@/features/editor/docState";
import { deriveFavorites, toggleFavorite } from "@/features/favorites/favorites";
import type { NoteNode, TreeNode } from "@/lib/types";
import { useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

const note = (id: string, title: string, isFavorite: boolean): NoteNode => ({ type: "note", id, title, relPath: id, isFavorite, tags: [], updatedAt: "" });
const metadata = { id: "a", title: "Ada", createdAt: "", updatedAt: "", isFavorite: true, tags: [], hasCustomCss: false, hasCustomJs: false };

beforeEach(() => {
  resetTreeStoreForTests();
  useTabsStore.setState({ tabs: [], activeId: null, restored: false });
  useUiStore.setState({ toasts: [] });
});

describe("favorites", () => {
  it("collects nested notes and sorts titles with Turkish collation", () => {
    const tree: TreeNode[] = [note("z", "Zeynep", true), { type: "folder", name: "A", relPath: "A", children: [note("i", "İpek", true), note("a", "Ada", true), note("x", "X", false)] }];
    expect(deriveFavorites(tree).map((entry) => entry.id)).toEqual(["a", "i", "z"]);
  });

  it("updates immediately, then keeps the new hash without changing a dirty draft", async () => {
    useTreeStore.setState({ tree: [note("a", "Ada", false)] });
    const doc = { ...createDocState(), mode: "code" as const, base: { html: "old", css: null, js: null, contentHash: "old" }, draft: { html: "draft", css: null, js: null }, dirty: true };
    useTabsStore.setState({ tabs: [{ noteId: "a", doc }] });
    let complete!: (value: { metadata: typeof metadata; contentHash: string }) => void;
    mockIPC(() => new Promise((resolve) => { complete = resolve; }));
    const pending = toggleFavorite("a", true);
    expect(useTreeStore.getState().findNoteById("a")?.isFavorite).toBe(true);
    complete({ metadata, contentHash: "new" });
    await pending;
    expect(useTabsStore.getState().tabs[0].doc).toMatchObject({ base: { contentHash: "new" }, draft: { html: "draft" }, dirty: true });
  });

  it("rolls back and reports an IPC error", async () => {
    useTreeStore.setState({ tree: [note("a", "Ada", false)] });
    mockIPC(() => { throw { code: "IO_ERROR", message: "failed" }; });
    await toggleFavorite("a", true);
    expect(useTreeStore.getState().findNoteById("a")?.isFavorite).toBe(false);
    expect(useUiStore.getState().toasts.slice(-1)[0]?.messageKey).toBe("errors.IO_ERROR");
  });
});
