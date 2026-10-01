import { describe, expect, it } from "vitest";

import { filterTree, matchRange } from "@/features/tree/filterTree";
import type { TreeNode } from "@/lib/types";

const note = (title: string, tags: string[] = []): TreeNode => ({ type: "note", id: title, title, relPath: title, isFavorite: false, tags, updatedAt: "" });
const tree: TreeNode[] = [
  { type: "folder", name: "Arşiv", relPath: "archive", children: [
    { type: "folder", name: "Alt", relPath: "archive/sub", children: [note("İğne", ["work"]), note("Başka")] },
  ] },
  { type: "folder", name: "Diğer", relPath: "other", children: [note("Rapor")] },
];

describe("filterTree", () => {
  it("returns the original tree for an empty query", () => {
    expect(filterTree(tree, "  ").tree).toBe(tree);
  });

  it.each([
    ["igne", "archive", ["archive", "archive/sub"]],
    ["arsiv", "archive", ["archive", "archive/sub"]],
    ["başka", "archive", ["archive", "archive/sub"]],
    ["rapor", "other", ["other"]],
  ])("filters %s and expands matching branches", (query, path, expanded) => {
    const result = filterTree(tree, query);
    expect(result.tree.map((node) => node.relPath)).toEqual([path]);
    expect([...result.autoExpanded].sort()).toEqual(expanded.sort());
  });

  it("keeps all descendants of a matching folder", () => {
    const result = filterTree(tree, "arsiv");
    const folder = result.tree[0];
    expect(folder.type).toBe("folder");
    if (folder.type === "folder") expect(folder.children[0]).toMatchObject({ type: "folder", children: [note("İğne", ["work"]), note("Başka")] });
  });

  it("applies a tag to notes, including descendants of a matching folder", () => {
    const result = filterTree(tree, "arsiv", { tag: "work" });
    const folder = result.tree[0];
    if (folder.type !== "folder" || folder.children[0].type !== "folder") throw new Error("Expected folders");
    expect(folder.children[0].children).toEqual([note("İğne", ["work"])]);
    expect(filterTree(tree, "", { tag: "missing" }).tree).toEqual([]);
  });

  it.each([
    ["İğne", "igne", [0, 4]],
    ["ışık", "isik", [0, 4]],
    ["Başka", "s", [2, 3]],
    ["Çağrı", "g", [2, 3]],
  ])("maps normalized match in %s back to original characters", (value, query, expected) => {
    expect(matchRange(value, query)).toEqual(expected);
  });

  it("filters 2,000 notes within a loose interaction budget", () => {
    const large = Array.from({ length: 2000 }, (_, index) => note(`Not ${index}`));
    const start = performance.now();
    expect(filterTree(large, "1999").tree).toHaveLength(1);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
