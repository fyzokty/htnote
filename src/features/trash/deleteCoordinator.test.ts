import { mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { resolveUnsaved } from "@/features/editor/unsavedGuard";
import type { TreeNode, TrashItem } from "@/lib/types";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

import { deleteTreeItem } from "./deleteCoordinator";

vi.mock("@/features/editor/unsavedGuard", () => ({ resolveUnsaved: vi.fn() }));

const note: TreeNode = { type: "note", id: "n", title: "Note", relPath: "A/Note", isFavorite: false, tags: [], updatedAt: "" };
const folder: TreeNode = { type: "folder", name: "A", relPath: "A", children: [note] };
const item: TrashItem = { trashId: "trash-1", title: "Note", kind: "note", originalRelPath: "A/Note", deletedAt: "2026-01-01T00:00:00Z", noteCount: 1 };

beforeEach(() => {
  resetTreeStoreForTests();
  resetTabsStoreForTests();
  useTreeStore.setState({ tree: [folder] });
  useUiStore.setState({ toasts: [], confirmDialog: null, unsavedDialog: null, trashCount: 0 });
  vi.mocked(resolveUnsaved).mockReset();
  vi.mocked(resolveUnsaved).mockImplementation(async (ids) => ({ resolved: new Set(ids), cancelled: false }));
});

describe("delete coordinator", () => {
  it("resolves affected tabs before closing and deleting, then undo restores", async () => {
    const order: string[] = [];
    useTabsStore.getState().openNote("n");
    vi.mocked(resolveUnsaved).mockImplementation(async (ids) => { order.push("guard"); return { resolved: new Set(ids), cancelled: false }; });
    mockIPC((command) => {
      if (command === "delete_item") { order.push("delete"); return item; }
      if (command === "list_trash") return [item];
      if (command === "get_note_tree") return order.includes("restore") ? [folder] : [];
      if (command === "restore_from_trash") { order.push("restore"); return "A/Note"; }
      return undefined;
    });
    const stop = useTabsStore.subscribe((state, previous) => {
      if (state.tabs.length < previous.tabs.length) order.push("close");
    });
    await deleteTreeItem(note);
    stop();
    expect(order.slice(0, 3)).toEqual(["guard", "guard", "close"]);
    expect(order.indexOf("delete")).toBeGreaterThan(order.indexOf("close"));
    expect(useUiStore.getState().toasts[0].messageKey).toBe("trash.moved");
    useUiStore.getState().toasts[0].action?.onClick();
    await vi.waitFor(() => expect(useTreeStore.getState().selected).toEqual({ kind: "note", id: "n" }));
    expect(order).toContain("restore");
  });

  it("does not delete when the unsaved guard cancels", async () => {
    const deleted = vi.fn();
    useTabsStore.getState().openNote("n");
    vi.mocked(resolveUnsaved).mockResolvedValue({ resolved: new Set(), cancelled: true });
    mockIPC((command) => { if (command === "delete_item") deleted(); return undefined; });
    await deleteTreeItem(note);
    expect(deleted).not.toHaveBeenCalled();
    expect(useTabsStore.getState().tabs).toHaveLength(1);
  });

  it("requires folder confirmation before the guard", async () => {
    const deleted = vi.fn();
    mockIPC((command) => { if (command === "delete_item") deleted(); return undefined; });
    const deleting = deleteTreeItem(folder);
    expect(useUiStore.getState().confirmDialog?.params).toEqual({ count: 1, name: "A" });
    useUiStore.getState().confirmDialog?.resolve(false);
    useUiStore.getState().closeConfirmDialog();
    await deleting;
    expect(resolveUnsaved).not.toHaveBeenCalled();
    expect(deleted).not.toHaveBeenCalled();
  });

  it("resolves all open folder notes in one batch", async () => {
    const another: TreeNode = { ...note, id: "m", title: "More", relPath: "A/More" };
    const parent: TreeNode = { ...folder, children: [note, another] };
    useTabsStore.getState().openNote("n");
    useTabsStore.getState().openNote("m");
    mockIPC((command) => {
      if (command === "delete_item") return { ...item, kind: "folder", originalRelPath: "A" };
      if (command === "get_note_tree") return [];
      if (command === "list_trash") return [item];
      return undefined;
    });
    const deleting = deleteTreeItem(parent);
    expect(useUiStore.getState().confirmDialog?.params?.count).toBe(2);
    useUiStore.getState().confirmDialog?.resolve(true);
    useUiStore.getState().closeConfirmDialog();
    await deleting;
    expect(vi.mocked(resolveUnsaved).mock.calls[0][0]).toEqual(["n", "m"]);
    expect(useTabsStore.getState().tabs).toHaveLength(0);
  });

  it("uses one unsaved dialog for dirty folder notes before closing or deleting", async () => {
    const another: TreeNode = { ...note, id: "m", title: "More", relPath: "A/More" };
    const parent: TreeNode = { ...folder, children: [note, another] };
    useTreeStore.setState({ tree: [parent] });
    const tabs = useTabsStore.getState();
    for (const id of ["n", "m"]) {
      tabs.openNote(id);
      tabs.enterEdit(id, { html: "old", css: null, js: null, contentHash: "hash" }, "code");
      tabs.updateDraft(id, { html: `changed ${id}` });
    }
    const actualGuard = await vi.importActual<typeof import("@/features/editor/unsavedGuard")>("@/features/editor/unsavedGuard");
    vi.mocked(resolveUnsaved).mockImplementation(actualGuard.resolveUnsaved);
    const order: string[] = [];
    const stop = useTabsStore.subscribe((state, previous) => {
      if (state.tabs.length < previous.tabs.length) order.push("close");
    });
    mockIPC((command) => {
      if (command === "delete_item") { order.push("delete"); return { ...item, kind: "folder", originalRelPath: "A" }; }
      if (command === "get_note_tree") return [];
      if (command === "list_trash") return [item];
      return undefined;
    });
    render(createElement(UnsavedChangesDialog));
    try {
      const deleting = deleteTreeItem(parent);
      useUiStore.getState().confirmDialog?.resolve(true);
      useUiStore.getState().closeConfirmDialog();
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      expect(useUiStore.getState().unsavedDialog?.noteIds).toEqual(["n", "m"]);
      expect(screen.getByText("Note")).toBeInTheDocument();
      expect(screen.getByText("More")).toBeInTheDocument();
      expect(order).toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: "Kaydetme" }));
      await deleting;
      expect(order).toEqual(["close", "close", "delete"]);
      expect(useTabsStore.getState().tabs).toHaveLength(0);
      expect(useUiStore.getState().unsavedDialog).toBeNull();
    } finally {
      stop();
    }
  });
});
