import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it } from "vitest";

import { createDocState } from "@/features/editor/docState";
import { addTag, deriveTags, removeTag, setNoteTags } from "@/features/tags/tags";
import type { NoteNode, TreeNode } from "@/lib/types";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

const note = (id: string, tags: string[]): NoteNode => ({ type: "note", id, title: id, relPath: id, isFavorite: false, tags, updatedAt: "" });
const metadata = (tags: string[]) => ({ id: "a", title: "a", createdAt: "", updatedAt: "", isFavorite: false, tags, hasCustomCss: false, hasCustomJs: false });

beforeEach(() => {
  resetTreeStoreForTests();
  resetTabsStoreForTests();
  useUiStore.setState({ toasts: [] });
});

describe("tags", () => {
  it("merges Turkish spelling variants, counts notes, and chooses the common spelling", () => {
    const tree: TreeNode[] = [note("a", ["İstanbul", "ISTANBUL"]), { type: "folder", name: "F", relPath: "f", children: [note("b", ["istanbul", "Zeytin"]), note("c", ["istanbul", "Ankara"]), note("d", ["Zeytin"])] }];
    expect(deriveTags(tree)).toEqual([{ tag: "istanbul", count: 3 }, { tag: "Zeytin", count: 2 }, { tag: "Ankara", count: 1 }]);
  });

  it("keeps the first encountered spelling when usage is tied", () => {
    expect(deriveTags([note("a", ["İstanbul"]), note("b", ["istanbul"])]))
      .toEqual([{ tag: "İstanbul", count: 2 }]);
  });

  it("prevents duplicates and removes equivalent spellings", () => {
    const tags = ["İstanbul"];
    expect(addTag(tags, " istanbul ")).toBe(tags);
    expect(addTag(tags, "Ankara")).toEqual(["İstanbul", "Ankara"]);
    expect(removeTag(tags, "ISTANBUL")).toEqual([]);
  });

  it("serializes rapid updates and keeps the latest optimistic state", async () => {
    useTreeStore.setState({ tree: [note("a", [])] });
    const doc = { ...createDocState(), base: { html: "", css: null, js: null, contentHash: "old" } };
    useTabsStore.setState({ tabs: [{ noteId: "a", doc }] });
    const completions: Array<(result: { metadata: ReturnType<typeof metadata>; contentHash: string }) => void> = [];
    mockIPC(() => new Promise((resolve) => { completions.push(resolve); }));
    const first = setNoteTags("a", ["one"]);
    await Promise.resolve();
    const second = setNoteTags("a", ["one", "two"]);
    expect(useTreeStore.getState().findNoteById("a")?.tags).toEqual(["one", "two"]);
    await Promise.resolve();
    completions[0]({ metadata: metadata(["one"]), contentHash: "first" });
    await first;
    expect(useTreeStore.getState().findNoteById("a")?.tags).toEqual(["one", "two"]);
    await Promise.resolve();
    completions[1]({ metadata: metadata(["one", "two"]), contentHash: "second" });
    await second;
    expect(useTabsStore.getState().tabs[0].doc.base?.contentHash).toBe("second");
  });

  it("persists the latest tags after an earlier failure without reporting that stale error", async () => {
    useTreeStore.setState({ tree: [note("a", ["old"])] });
    let rejectFirst: (reason: unknown) => void = () => {};
    const writes: string[][] = [];
    mockIPC((_command, args) => {
      const tags = (args as { patch: { tags: string[] } }).patch.tags;
      writes.push(tags);
      if (writes.length === 1) return new Promise((_resolve, reject) => { rejectFirst = reject; });
      return { metadata: metadata(tags), contentHash: "latest" };
    });
    const first = setNoteTags("a", ["old", "new"]);
    await Promise.resolve();
    const second = setNoteTags("a", ["old"]);
    rejectFirst({ code: "IO_ERROR", message: "failed" });
    await Promise.all([first, second]);
    expect(writes).toEqual([["old", "new"], ["old"]]);
    expect(useTreeStore.getState().findNoteById("a")?.tags).toEqual(["old"]);
    expect(useUiStore.getState().toasts).toEqual([]);
  });

  it("rolls back on failure and reports the error", async () => {
    useTreeStore.setState({ tree: [note("a", ["old"])] });
    mockIPC(() => { throw { code: "IO_ERROR", message: "failed" }; });
    await setNoteTags("a", ["new"]);
    expect(useTreeStore.getState().findNoteById("a")?.tags).toEqual(["old"]);
    expect(useUiStore.getState().toasts.slice(-1)[0]?.messageKey).toBe("errors.IO_ERROR");
  });
});
