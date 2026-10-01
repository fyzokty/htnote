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
    expect(nextVisibleNode(tree, expanded, folder, "ArrowUp")).toEqual({ node: folder });
    expect(nextVisibleNode(tree, expanded, folder, "ArrowDown")).toEqual({ node: sibling });
    expect(nextVisibleNode(tree, expanded, sibling, "ArrowDown")).toEqual({ node: sibling });
    expect(nextVisibleNode(tree, expanded, null, "ArrowDown")).toEqual({ node: folder });
  });

  it("moves into open folders and back to parents", () => {
    const expanded = new Set(["A", "A/Nested"]);
    expect(nextVisibleNode(tree, expanded, folder, "ArrowRight")).toEqual({ node: child });
    expect(nextVisibleNode(tree, expanded, child, "ArrowLeft")).toEqual({ node: folder });
    expect(nextVisibleNode(tree, expanded, deep, "ArrowLeft")).toEqual({ node: nested });
    expect(nextVisibleNode(tree, expanded, nested, "ArrowLeft")).toEqual({ node: nested, expansion: "collapse" });
    expect(nextVisibleNode(tree, expanded, deep, "ArrowRight")).toEqual({ node: deep });
  });

  it("signals expansion for closed folders", () => {
    expect(nextVisibleNode(tree, new Set(), folder, "ArrowRight")).toEqual({ node: folder, expansion: "expand" });
    expect(nextVisibleNode(tree, new Set(["A"]), nested, "ArrowRight")).toEqual({ node: nested, expansion: "expand" });
    expect(nextVisibleNode(tree, new Set(), folder, "ArrowLeft")).toEqual({ node: folder });
    expect(nextVisibleNode([], new Set(), null, "ArrowDown")).toBeNull();
  });
});
