import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarTree } from "@/features/tree/SidebarTree";
import type { TreeNode } from "@/lib/types";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";

const note: TreeNode = { type: "note", id: "n", title: "Dragged note", relPath: "A/Note", isFavorite: false, tags: [], updatedAt: "" };
const tree: TreeNode[] = [
  { type: "folder", name: "A", relPath: "A", children: [note] },
  { type: "folder", name: "B", relPath: "B", children: [] },
];

class TestPointerEvent extends MouseEvent {
  readonly pointerId = 1;
  readonly isPrimary = true;
  readonly pointerType = "mouse";
}

beforeEach(() => {
  resetTreeStoreForTests();
  useTreeStore.setState({ tree, expanded: new Set(["A"]) });
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const key = this.dataset.treeKey;
    const y = key === "folder:A" ? 0 : key === "note:n" ? 30 : key === "folder:B" ? 60 : 0;
    return { x: 0, y, left: 0, top: y, right: 260, bottom: key ? y + 28 : 300, width: 260, height: key ? 28 : 300, toJSON: () => ({}) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.cursor = "";
});

async function startDrag(name = "Not: Dragged note", y = 40) {
  const row = screen.getByRole("treeitem", { name });
  fireEvent.pointerDown(row, { button: 0, clientX: 100, clientY: y });
  fireEvent.pointerMove(document, { clientX: 110, clientY: y });
  await screen.findByTestId("tree-drag-preview");
  return row;
}

describe("SidebarTree drag preview", () => {
  it("hides the target hint and uses the grabbing cursor when there is no target", async () => {
    render(<SidebarTree onOpenNote={vi.fn()} />);
    await startDrag();
    const preview = screen.getByTestId("tree-drag-preview");
    expect(preview).toHaveTextContent(note.title);
    expect(preview).not.toHaveTextContent("Buraya taşınamaz");
    expect(within(preview).queryByText(/^Hedef:/)).not.toBeInTheDocument();
    expect(preview.querySelector(".text-app-danger, .text-app-accent")).not.toBeInTheDocument();
    expect(preview).toHaveClass("cursor-grabbing");
    expect(preview).not.toHaveClass("cursor-not-allowed");

    fireEvent.pointerMove(document, { clientX: 120, clientY: 70 });
    await waitFor(() => expect(preview).toHaveTextContent("Hedef: B"));
    fireEvent.pointerMove(document, { clientX: 300, clientY: 400 });
    await waitFor(() => expect(within(preview).queryByText(/^Hedef:/)).not.toBeInTheDocument());
    expect(preview).not.toHaveTextContent("Buraya taşınamaz");
    expect(preview.querySelector(".text-app-danger, .text-app-accent")).not.toBeInTheDocument();
    expect(preview).toHaveClass("cursor-grabbing");
    expect(preview).not.toHaveClass("cursor-not-allowed");
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("tree-drag-preview")).not.toBeInTheDocument());
  });

  it("portals the note card, leaves the source in place, and removes it on Escape", async () => {
    document.body.style.cursor = "crosshair";
    const { container } = render(<SidebarTree onOpenNote={vi.fn()} />);
    const row = await startDrag();
    const preview = screen.getByTestId("tree-drag-preview");
    expect(preview).toHaveTextContent(note.title);
    expect(container).not.toContainElement(preview);
    expect(row).toHaveClass("opacity-40");
    expect(row.style.transform).toBe("");
    expect(document.body.style.cursor).toBe("grabbing");
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("tree-drag-preview")).not.toBeInTheDocument());
    expect(document.body.style.cursor).toBe("crosshair");
  });

  it("changes the target hint and removes the preview on a valid drop", async () => {
    const move = vi.fn();
    mockIPC((command, args) => {
      if (command === "move_item") { move(args); return "B/Note"; }
      if (command === "get_note_tree") return tree;
      return undefined;
    });
    render(<SidebarTree onOpenNote={vi.fn()} />);
    await startDrag();
    fireEvent.pointerMove(document, { clientX: 120, clientY: 70 });
    await waitFor(() => expect(screen.getByTestId("tree-drag-preview")).toHaveAttribute("data-drop-valid", "true"));
    expect(within(screen.getByTestId("tree-drag-preview")).getByText("Hedef: B")).toBeInTheDocument();
    fireEvent.pointerMove(document, { clientX: 120, clientY: 10 });
    await waitFor(() => expect(screen.getByTestId("tree-drag-preview")).toHaveTextContent("Buraya taşınamaz"));
    expect(screen.getByTestId("tree-drag-preview")).toHaveClass("cursor-not-allowed");
    fireEvent.pointerMove(document, { clientX: 120, clientY: 70 });
    await waitFor(() => expect(screen.getByTestId("tree-drag-preview")).toHaveAttribute("data-drop-valid", "true"));
    fireEvent.pointerUp(document, { clientX: 120, clientY: 70 });
    await waitFor(() => expect(screen.queryByTestId("tree-drag-preview")).not.toBeInTheDocument());
    expect(document.body.style.cursor).toBe("");
    expect(move).toHaveBeenCalledWith({ relPath: "A/Note", targetFolderRelPath: "B" });
  });

  it("shows the open folder icon and direct count and cleans up on unmount", async () => {
    const { unmount } = render(<SidebarTree onOpenNote={vi.fn()} />);
    await startDrag("Klasör: A", 10);
    const preview = screen.getByTestId("tree-drag-preview");
    expect(preview).toHaveTextContent("A");
    expect(within(preview).getByText("1")).toBeInTheDocument();
    expect(preview.querySelector(".lucide-folder-open")).toBeInTheDocument();
    unmount();
    await waitFor(() => expect(screen.queryByTestId("tree-drag-preview")).not.toBeInTheDocument());
    expect(document.body.style.cursor).toBe("");
  });

  it("keeps the root target usable and rejects a drop on the current parent", async () => {
    const move = vi.fn();
    mockIPC((command, args) => { if (command === "move_item") move(args); });
    render(<SidebarTree onOpenNote={vi.fn()} />);
    await startDrag();
    fireEvent.pointerMove(document, { clientX: 120, clientY: 200 });
    await waitFor(() => expect(screen.getByTestId("tree-drag-preview")).toHaveTextContent("Kök"));
    expect(screen.getByRole("tree")).toHaveAttribute("data-drop-target", "valid");
    fireEvent.pointerMove(document, { clientX: 120, clientY: 10 });
    await waitFor(() => expect(screen.getByTestId("tree-drag-preview")).toHaveAttribute("data-drop-valid", "false"));
    fireEvent.pointerUp(document, { clientX: 120, clientY: 10 });
    await waitFor(() => expect(screen.queryByTestId("tree-drag-preview")).not.toBeInTheDocument());
    expect(move).not.toHaveBeenCalled();
  });
});
