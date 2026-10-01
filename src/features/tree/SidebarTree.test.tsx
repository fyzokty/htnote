import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarTree } from "@/features/tree/SidebarTree";
import { useTreeActions } from "@/features/tree/useTreeActions";
import type { TreeNode } from "@/lib/types";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";

const note: TreeNode = { type: "note", id: "n", title: "Note", relPath: "A/Note", isFavorite: false, tags: [], updatedAt: "" };
const tree: TreeNode[] = [{ type: "folder", name: "A", relPath: "A", children: [note] }];

function CreateButtons({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const { createNote, createFolder } = useTreeActions(onOpenNote);
  return <><button onClick={() => void createNote()}>Create note</button><button onClick={() => void createFolder()}>Create folder</button></>;
}

beforeEach(() => {
  resetTreeStoreForTests();
  useTreeStore.setState({ tree });
});

describe("SidebarTree keyboard focus", () => {
  it("creates a note in the selected folder with the translated title and selects it", async () => {
    const created: TreeNode = { type: "note", id: "new", title: "Adsız Not", relPath: "A/Adsız Not", isFavorite: false, tags: [], updatedAt: "" };
    const calls: unknown[] = [];
    const opened = vi.fn();
    useTreeStore.getState().select({ kind: "folder", relPath: "A" });
    mockIPC((command, args) => {
      if (command === "create_note") { calls.push(args); return created; }
      if (command === "get_note_tree") return [{ type: "folder", name: "A", relPath: "A", children: [note, created] }];
      return undefined;
    });
    render(<CreateButtons onOpenNote={opened} />);
    fireEvent.click(screen.getByRole("button", { name: "Create note" }));
    await waitFor(() => expect(opened).toHaveBeenCalledWith("new"));
    expect(calls).toEqual([{ parentRelPath: "A", title: "Adsız Not" }]);
    expect(useTreeStore.getState().selected).toEqual({ kind: "note", id: "new" });
  });

  it("opens inline rename immediately after creating a folder", async () => {
    const folder: TreeNode = { type: "folder", name: "Yeni Klasör", relPath: "A/Yeni Klasör", children: [] };
    useTreeStore.getState().select({ kind: "folder", relPath: "A" });
    mockIPC((command) => {
      if (command === "create_folder") return folder;
      if (command === "get_note_tree") return [{ type: "folder", name: "A", relPath: "A", children: [folder] }];
      return undefined;
    });
    render(<><CreateButtons onOpenNote={vi.fn()} /><SidebarTree onOpenNote={vi.fn()} /></>);
    fireEvent.click(screen.getByRole("button", { name: "Create folder" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Yeniden Adlandır" })).toHaveFocus());
    expect(useTreeStore.getState().selected).toEqual({ kind: "folder", relPath: "A/Yeni Klasör" });
  });
  it("opens a folder context menu and renames inline", async () => {
    let nodes = tree;
    const calls: string[] = [];
    mockIPC((command) => {
      calls.push(command);
      if (command === "rename_folder") { nodes = [{ type: "folder", name: "B", relPath: "B", children: [] }]; return nodes[0]; }
      if (command === "get_note_tree") return nodes;
      return undefined;
    });
    render(<SidebarTree onOpenNote={vi.fn()} />);
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "Klasör: A" }));
    expect(screen.getByRole("menuitem", { name: /Yeni Klasör/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Yeniden Adlandır/ }));
    const input = screen.getByRole("textbox", { name: "Yeniden Adlandır" });
    fireEvent.change(input, { target: { value: "B" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("treeitem", { name: "Klasör: B" })).toBeInTheDocument());
    expect(calls).toContain("rename_folder");
  });
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

  it("keeps focus on a folder after click and Enter toggle", () => {
    render(<SidebarTree onOpenNote={vi.fn()} />);
    const root = screen.getByRole("tree");
    const folder = screen.getByRole("treeitem", { name: "Klasör: A" });
    root.focus();
    fireEvent.click(folder);
    expect(folder).toHaveAttribute("aria-expanded", "true");
    expect(folder).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(folder);

    root.focus();
    fireEvent.keyDown(root, { key: "Enter" });
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
