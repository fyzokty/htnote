import { mockIPC } from "@tauri-apps/api/mocks";
import { describe, expect, it, vi } from "vitest";

import { ipc } from "@/lib/ipc";
import type { AppInfo } from "@/lib/types";

describe("ipc.appInfo", () => {
  it("app_info komutundan tipli yanıt döndürür", async () => {
    const info: AppInfo = { version: "0.1.0", platform: "windows" };
    const handler = vi.fn((command: string) => {
      if (command === "app_info") {
        return info;
      }
      throw new Error(`Beklenmeyen komut: ${command}`);
    });
    mockIPC(handler);

    await expect(ipc.appInfo()).resolves.toEqual(info);
    expect(handler).toHaveBeenCalledWith("app_info", {});
  });
});

describe("ipc.getNoteTree", () => {
  it("get_note_tree komutundan ağacı döndürür", async () => {
    const handler = vi.fn((command: string) => {
      if (command === "get_note_tree") return [];
      throw new Error(`Beklenmeyen komut: ${command}`);
    });
    mockIPC(handler);
    await expect(ipc.getNoteTree()).resolves.toEqual([]);
    expect(handler).toHaveBeenCalledWith("get_note_tree", {});
  });
});

describe("ipc.searchNotes", () => {
  it("passes query and optional limit", async () => {
    const response = { results: [], indexing: true };
    const handler = vi.fn(() => response);
    mockIPC(handler);
    await expect(ipc.searchNotes("İstanbul")).resolves.toEqual(response);
    expect(handler).toHaveBeenCalledWith("search_notes", { query: "İstanbul", limit: null });
    await ipc.searchNotes("ılık", 5);
    expect(handler).toHaveBeenCalledWith("search_notes", { query: "ılık", limit: 5 });
  });
});

describe("ipc link commands", () => {
  it("passes note ids and returns link items", async () => {
    const incoming = [{ id: "source", title: "Source", relPath: "Source", snippet: "context" }];
    const broken = [{ targetId: "missing", text: "Missing" }];
    const handler = vi.fn((command: string) => command === "get_backlinks" ? incoming : broken);
    mockIPC(handler);
    await expect(ipc.getBacklinks("target")).resolves.toEqual(incoming);
    await expect(ipc.getBrokenLinks("target")).resolves.toEqual(broken);
    expect(handler).toHaveBeenCalledWith("get_backlinks", { id: "target" });
    expect(handler).toHaveBeenCalledWith("get_broken_links", { id: "target" });
  });
});

describe("ipc.saveNote", () => {
  it("sends the note id and content payload", async () => {
    const result = { metadata: { title: "Not" }, contentHash: "hash" };
    const handler = vi.fn(() => result);
    mockIPC(handler);
    const payload = { html: "<main></main>", css: "", js: "", expectedHash: null };
    await expect(ipc.saveNote("note-id", payload)).resolves.toEqual(result);
    expect(handler).toHaveBeenCalledWith("save_note", { id: "note-id", payload });
  });
});

describe("ipc.updateMetadata", () => {
  it("sends the metadata patch", async () => {
    const result = { metadata: { isFavorite: true }, contentHash: "hash" };
    const handler = vi.fn(() => result);
    mockIPC(handler);
    await expect(ipc.updateMetadata("note-id", { isFavorite: true })).resolves.toEqual(result);
    expect(handler).toHaveBeenCalledWith("update_metadata", { id: "note-id", patch: { isFavorite: true } });
  });
});

describe("ipc asset commands", () => {
  it("maps copy and byte save arguments to Tauri commands", async () => {
    const result = { relPath: "./assets/resim.png", kind: "image", mime: "image/png" };
    const handler = vi.fn(() => result);
    mockIPC(handler);
    await expect(ipc.copyAsset("note-id", "C:/resim.png")).resolves.toEqual(result);
    expect(handler).toHaveBeenCalledWith("copy_asset", { noteId: "note-id", sourcePath: "C:/resim.png" });
    await expect(ipc.saveAssetBytes("note-id", "resim.png", new Uint8Array([0, 127, 255]))).resolves.toEqual(result);
    expect(handler).toHaveBeenCalledWith("save_asset_bytes", { noteId: "note-id", suggestedName: "resim.png", bytes: [0, 127, 255] });
  });
});

describe("ipc preview draft commands", () => {
  it("sends draft content and clear id", async () => {
    const handler = vi.fn((command: string) => command === "set_preview_draft" ? 4 : undefined);
    mockIPC(handler);
    await expect(ipc.setPreviewDraft("id", { html: "<p>x</p>", css: "a{}", js: "x()" })).resolves.toBe(4);
    expect(handler).toHaveBeenCalledWith("set_preview_draft", { id: "id", html: "<p>x</p>", css: "a{}", js: "x()" });
    await ipc.clearPreviewDraft("id");
    expect(handler).toHaveBeenCalledWith("clear_preview_draft", { id: "id" });
  });
});

describe("ipc recovery draft commands", () => {
  it("passes typed draft payloads and ids", async () => {
    const handler = vi.fn((command: string) => command === "list_drafts" ? [] : undefined);
    mockIPC(handler);
    const payload = { html: "h", css: "c", js: "j", baseHash: "hash", savedAt: "2026-10-01T00:00:00Z" };
    await ipc.writeDraft("id", payload);
    await ipc.readDraft("id");
    await ipc.deleteDraft("id");
    await ipc.listDrafts();
    expect(handler).toHaveBeenCalledWith("write_draft", { id: "id", payload });
    expect(handler).toHaveBeenCalledWith("read_draft", { id: "id" });
    expect(handler).toHaveBeenCalledWith("delete_draft", { id: "id" });
    expect(handler).toHaveBeenCalledWith("list_drafts", {});
  });
});

describe("ipc creation commands", () => {
  it("createNote sends its parent and optional title", async () => {
    const node = { type: "note", id: "id", title: "Fikir", relPath: "Fikir", isFavorite: false, tags: [], updatedAt: "date" };
    const handler = vi.fn(() => node);
    mockIPC(handler);
    await expect(ipc.createNote("", "Fikir")).resolves.toEqual(node);
    expect(handler).toHaveBeenCalledWith("create_note", { parentRelPath: "", title: "Fikir" });
    await ipc.createNote("Alt");
    expect(handler).toHaveBeenCalledWith("create_note", { parentRelPath: "Alt", title: null });
  });

  it("createFolder sends its parent and name", async () => {
    const node = { type: "folder", name: "Alt", relPath: "Alt", children: [] };
    const handler = vi.fn(() => node);
    mockIPC(handler);
    await expect(ipc.createFolder("", "Alt")).resolves.toEqual(node);
    expect(handler).toHaveBeenCalledWith("create_folder", { parentRelPath: "", name: "Alt" });
  });
});

describe("ipc rename and move commands", () => {
  it("sends rename and move arguments", async () => {
    const handler = vi.fn(() => "moved/path");
    mockIPC(handler);
    await ipc.renameNote("id", "New title");
    expect(handler).toHaveBeenCalledWith("rename_note", { id: "id", newTitle: "New title" });
    await ipc.renameFolder("old", "New");
    expect(handler).toHaveBeenCalledWith("rename_folder", { relPath: "old", newName: "New" });
    await expect(ipc.moveItem("old", "target")).resolves.toBe("moved/path");
    expect(handler).toHaveBeenCalledWith("move_item", { relPath: "old", targetFolderRelPath: "target" });
    await ipc.revealInExplorer("moved/path");
    expect(handler).toHaveBeenCalledWith("reveal_in_explorer", { relPath: "moved/path" });
  });
});

describe("ipc trash commands", () => {
  it("passes paths and IDs to the matching commands", async () => {
    const item = { trashId: "Note__20261002-120000", title: "Note", kind: "note", originalRelPath: "Note", deletedAt: "2026-10-02T12:00:00Z", noteCount: 1 };
    const handler = vi.fn((command: string) => command === "list_trash" ? [item] : command === "restore_from_trash" ? "Note (2)" : item);
    mockIPC(handler);
    await expect(ipc.deleteItem("Note")).resolves.toEqual(item);
    await expect(ipc.listTrash()).resolves.toEqual([item]);
    await expect(ipc.restoreFromTrash(item.trashId)).resolves.toBe("Note (2)");
    await ipc.deletePermanently(item.trashId);
    await ipc.emptyTrash();
    expect(handler).toHaveBeenCalledWith("delete_item", { relPath: "Note" });
    expect(handler).toHaveBeenCalledWith("list_trash", {});
    expect(handler).toHaveBeenCalledWith("restore_from_trash", { trashId: item.trashId });
    expect(handler).toHaveBeenCalledWith("delete_permanently", { trashId: item.trashId });
    expect(handler).toHaveBeenCalledWith("empty_trash", {});
  });
});
