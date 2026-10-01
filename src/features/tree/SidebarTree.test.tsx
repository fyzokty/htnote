import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarTree } from "@/features/tree/SidebarTree";
import type { TreeNode } from "@/lib/types";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";

const note: TreeNode = { type: "note", id: "n", title: "Note", relPath: "A/Note", isFavorite: false, tags: [], updatedAt: "" };
const tree: TreeNode[] = [{ type: "folder", name: "A", relPath: "A", children: [note] }];

beforeEach(() => {
  resetTreeStoreForTests();
  useTreeStore.setState({ tree });
});

describe("SidebarTree keyboard focus", () => {
  it("keeps focus and selection on a folder when arrows expand and collapse it", () => {
    render(<SidebarTree onOpenNote={vi.fn()} />);
    const folder = screen.getByRole("treeitem", { name: "Klasör: A" });
    folder.focus();

    fireEvent.keyDown(folder, { key: "ArrowRight" });
    expect(folder).toHaveAttribute("aria-expanded", "true");
    expect(folder).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(folder);

    fireEvent.keyDown(folder, { key: "ArrowLeft" });
    expect(folder).toHaveAttribute("aria-expanded", "false");
    expect(folder).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(folder);
  });

  it("moves focus and selection to the first child of an open folder", () => {
    useTreeStore.setState({ expanded: new Set(["A"]), selected: { kind: "folder", relPath: "A" } });
    render(<SidebarTree onOpenNote={vi.fn()} />);
    const folder = screen.getByRole("treeitem", { name: "Klasör: A" });
    const child = screen.getByRole("treeitem", { name: "Not: Note" });
    folder.focus();

    fireEvent.keyDown(folder, { key: "ArrowRight" });
    expect(child).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(child);

    fireEvent.keyDown(child, { key: "ArrowLeft" });
    expect(folder).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(folder);
  });
});
