import { describe, expect, it } from "vitest";

import { nextVisibleNode, visibleNodes } from "@/features/tree/treeNavigation";
import type { TreeNode } from "@/lib/types";

const note = (id: string): TreeNode => ({ type: "note", id, title: id, relPath: id, isFavorite: false, tags: [], updatedAt: "" });
const deep = note("deep");
const child = note("child");
const sibling = note("sibling");
const nested: TreeNode = { type: "folder", name: "Nested", relPath: "A/Nested", children: [deep] };
const folder: TreeNode = { type: "folder", name: "A", relPath: "A", children: [child, nested] };
const tree = [folder, sibling];

describe("tree navigation", () => {
  it("skips closed descendants and clamps vertical movement", () => {
    const expanded = new Set<string>();
    expect(visibleNodes(tree, expanded).map(({ node }) => node)).toEqual([folder, sibling]);
    expect(nextVisibleNode(tree, expanded, folder, "ArrowUp")).toBe(folder);
    expect(nextVisibleNode(tree, expanded, folder, "ArrowDown")).toBe(sibling);
    expect(nextVisibleNode(tree, expanded, sibling, "ArrowDown")).toBe(sibling);
    expect(nextVisibleNode(tree, expanded, null, "ArrowDown")).toBe(folder);
  });

  it("moves into open folders and back to parents", () => {
    const expanded = new Set(["A", "A/Nested"]);
    expect(nextVisibleNode(tree, expanded, folder, "ArrowRight")).toBe(child);
    expect(nextVisibleNode(tree, expanded, child, "ArrowLeft")).toBe(folder);
    expect(nextVisibleNode(tree, expanded, deep, "ArrowLeft")).toBe(nested);
    expect(nextVisibleNode(tree, expanded, nested, "ArrowLeft")).toBe(nested);
    expect(nextVisibleNode(tree, expanded, deep, "ArrowRight")).toBe(deep);
  });

  it("keeps a closed folder selected until the UI expands it", () => {
    expect(nextVisibleNode(tree, new Set(), folder, "ArrowRight")).toBe(folder);
    expect(nextVisibleNode(tree, new Set(["A"]), nested, "ArrowRight")).toBe(nested);
    expect(nextVisibleNode([], new Set(), null, "ArrowDown")).toBeNull();
  });
});
