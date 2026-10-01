import { act, fireEvent, render, screen } from "@testing-library/react";
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
  it("keeps exactly one tab stop and moves focus from the root with arrow keys", () => {
    const { container } = render(<SidebarTree onOpenNote={vi.fn()} />);
    const root = screen.getByRole("tree");
    const folder = screen.getByRole("treeitem", { name: "Klasör: A" });
    expect(root).toHaveAttribute("tabindex", "-1");
    expect(folder).toHaveAttribute("tabindex", "0");
    root.focus();
    fireEvent.keyDown(root, { key: "ArrowDown" });
    expect(document.activeElement).toBe(folder);
    expect(folder).toHaveAttribute("aria-selected", "true");

    act(() => useTreeStore.getState().select({ kind: "note", id: "n" }));
    expect(folder).toHaveAttribute("tabindex", "0");
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);

    act(() => useTreeStore.setState({ tree: [] }));
    expect(root).toHaveAttribute("tabindex", "0");
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

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
    expect(child).toHaveAttribute("tabindex", "0");
    expect(folder).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(child);

    fireEvent.keyDown(child, { key: "ArrowLeft" });
    expect(folder).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(folder);
  });

  it("moves from the root to the last visible row with ArrowUp", () => {
    useTreeStore.setState({ expanded: new Set(["A"]) });
    render(<SidebarTree onOpenNote={vi.fn()} />);
    const root = screen.getByRole("tree");
    const child = screen.getByRole("treeitem", { name: "Not: Note" });
    root.focus();
    fireEvent.keyDown(root, { key: "ArrowUp" });
    expect(document.activeElement).toBe(child);
    expect(child).toHaveAttribute("aria-selected", "true");
  });

  it("does not move focus into the tree for external selection or expansion", () => {
    render(<><button type="button">Outside</button><SidebarTree onOpenNote={vi.fn()} /></>);
    const outside = screen.getByRole("button", { name: "Outside" });
    outside.focus();
    act(() => {
      useTreeStore.getState().select({ kind: "folder", relPath: "A" });
      useTreeStore.getState().toggle("A");
    });
    expect(screen.getByRole("treeitem", { name: "Klasör: A" })).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(outside);
  });
});
