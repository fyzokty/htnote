import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import i18n from "@/i18n";
import type { TrashItem } from "@/lib/types";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

import { TrashView } from "./TrashView";

const item: TrashItem = { trashId: "trash-1", title: "Old note", kind: "note", originalRelPath: "Folder/Old note", deletedAt: "2026-01-02T12:00:00Z", noteCount: 1 };

beforeEach(() => {
  resetTreeStoreForTests();
  useUiStore.setState({ confirmDialog: null, trashRevision: 0, trashCount: 0 });
});

describe("TrashView", () => {
  it("lists items and restores a note", async () => {
    const restore = vi.fn(() => "Folder/Old note");
    mockIPC((command) => {
      if (command === "list_trash") return [item];
      if (command === "restore_from_trash") return restore();
      if (command === "get_note_tree") return [{ type: "note", id: "restored", title: "Old note", relPath: "Folder/Old note", isFavorite: false, tags: [], updatedAt: "" }];
      return undefined;
    });
    render(<TrashView />);
    expect(await screen.findByText("Old note")).toBeInTheDocument();
    expect(screen.getByText(/Folder\/Old note/)).toBeInTheDocument();
    const formatted = new Intl.DateTimeFormat("tr", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.deletedAt));
    expect(screen.getByText((text) => text.includes(formatted))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Geri Yükle" }));
    await waitFor(() => expect(restore).toHaveBeenCalledOnce());
    await waitFor(() => expect(useTreeStore.getState().selected).toEqual({ kind: "note", id: "restored" }));
  });

  it("formats deletion times in the selected language", async () => {
    mockIPC((command) => command === "list_trash" ? [item] : undefined);
    await i18n.changeLanguage("en");
    try {
      render(<TrashView />);
      const formatted = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.deletedAt));
      await waitFor(() => expect(screen.getByText((text) => text.includes(formatted))).toBeInTheDocument());
    } finally {
      await i18n.changeLanguage("tr");
    }
  });

  it("requires confirmation for permanent delete and empty trash", async () => {
    const remove = vi.fn();
    const empty = vi.fn();
    mockIPC((command) => {
      if (command === "list_trash") return [item];
      if (command === "delete_permanently") { remove(); return undefined; }
      if (command === "empty_trash") { empty(); return undefined; }
      return undefined;
    });
    render(<><TrashView /><ConfirmDialog /></>);
    await screen.findByText("Old note");
    fireEvent.click(screen.getByRole("button", { name: "Kalıcı Sil" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "İptal" })).toHaveFocus();
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "İptal" }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Kalıcı Sil" }));
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    await waitFor(() => expect(remove).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Çöpü Boşalt" }));
    expect(empty).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "İptal" }));
    expect(empty).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Çöpü Boşalt" }));
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    await waitFor(() => expect(empty).toHaveBeenCalledOnce());
  });

  it("focuses Cancel and lets Escape cancel confirmation", async () => {
    const empty = vi.fn();
    mockIPC((command) => {
      if (command === "list_trash") return [item];
      if (command === "empty_trash") empty();
      return undefined;
    });
    render(<><TrashView /><ConfirmDialog /></>);
    await screen.findByText("Old note");
    fireEvent.click(screen.getByRole("button", { name: "Çöpü Boşalt" }));
    expect(screen.getByRole("button", { name: "İptal" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(empty).not.toHaveBeenCalled();
  });
});
