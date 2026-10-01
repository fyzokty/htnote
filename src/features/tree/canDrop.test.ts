import { describe, expect, it } from "vitest";

import { canDrop } from "@/features/tree/canDrop";
import type { TreeNode } from "@/lib/types";

const note: TreeNode = { type: "note", id: "n", title: "Note", relPath: "a/n", isFavorite: false, tags: [], updatedAt: "" };
const child: TreeNode = { type: "folder", name: "child", relPath: "a/child", children: [] };
const folder: TreeNode = { type: "folder", name: "a", relPath: "a", children: [child, note] };
const sibling: TreeNode = { type: "folder", name: "ab", relPath: "ab", children: [] };
const tree = [folder, sibling];

describe("canDrop", () => {
  it("rejects itself and descendants, but accepts a component-similar sibling", () => {
    expect(canDrop(folder, "a", tree)).toBe(false);
    expect(canDrop(folder, "a/child", tree)).toBe(false);
    expect(canDrop(folder, "ab", tree)).toBe(true);
  });
  it("rejects the current parent and note or missing targets", () => {
    expect(canDrop(note, "a", tree)).toBe(false);
    expect(canDrop(note, "a/n", tree)).toBe(false);
    expect(canDrop(note, "missing", tree)).toBe(false);
    expect(canDrop(child, "a/n", tree)).toBe(false);
  });
  it("accepts root only when it changes the parent", () => {
    expect(canDrop(note, "", tree)).toBe(true);
    expect(canDrop(folder, "", tree)).toBe(false);
    expect(canDrop(folder, "ab", tree)).toBe(true);
  });
});
