import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExternalChangeBanner } from "@/features/editor/ExternalChangeBanner";
import { ipc } from "@/lib/ipc";
import type { NoteData, NoteNode } from "@/lib/types";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests } from "@/stores/treeStore";

const old: NoteData = {
  metadata: { id: "a", title: "A", createdAt: "", updatedAt: "", isFavorite: false, tags: [], hasCustomCss: false, hasCustomJs: false },
  html: "old", css: "", js: "", contentHash: "old-hash",
};
const disk = { ...old, html: "disk", contentHash: "disk-hash" };
const created: NoteNode = { type: "note", id: "b", title: "A", relPath: "A 2", isFavorite: false, tags: [], updatedAt: "" };
const doc = () => useTabsStore.getState().tabs.find((tab) => tab.noteId === "a")?.doc;

beforeEach(() => {
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  useTabsStore.getState().openNote("a");
  useTabsStore.getState().enterEdit("a", old, "code");
  useTabsStore.getState().updateDraft("a", { html: "mine" });
  vi.spyOn(ipc, "clearPreviewDraft").mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetTabsStoreForTests();
  resetTreeStoreForTests();
});

describe("ExternalChangeBanner", () => {
  it("loads disk content and clears both preview and recovery draft", async () => {
    const commands: string[] = [];
    mockIPC((command) => {
      commands.push(command);
      if (command === "read_note") return disk;
    });
    useTabsStore.getState().markConflict("a", disk.contentHash);
    render(<ExternalChangeBanner noteId="a" doc={doc()!} />);
    fireEvent.click(screen.getByRole("button", { name: "Diskten yükle" }));
    await waitFor(() => expect(doc()).toMatchObject({ base: disk, draft: { html: "disk" }, dirty: false, externalConflict: null }));
    expect(commands).toContain("delete_draft");
    expect(ipc.clearPreviewDraft).toHaveBeenCalledWith("a");
  });

  it("keeps the draft and updates expectedHash to the latest disk hash", async () => {
    mockIPC((command) => command === "read_note" ? disk : undefined);
    useTabsStore.getState().markConflict("a", "earlier-hash");
    render(<ExternalChangeBanner noteId="a" doc={doc()!} />);
    fireEvent.click(screen.getByRole("button", { name: "Benimkini koru" }));
    await waitFor(() => expect(doc()).toMatchObject({ base: { contentHash: "disk-hash" }, draft: { html: "mine" }, externalConflict: null }));
  });

  it("saves a removed draft as a new note and retargets the tab", async () => {
    const commands: string[] = [];
    mockIPC((command) => {
      commands.push(command);
      if (command === "create_note") return created;
      if (command === "read_note") return { ...old, contentHash: "blank-hash" };
      if (command === "save_note") return { metadata: old.metadata, contentHash: "new-hash" };
      if (command === "get_note_tree") return [created];
    });
    useTabsStore.getState().markRemoved("a", "A", "");
    render(<ExternalChangeBanner noteId="a" doc={doc()!} />);
    fireEvent.click(screen.getByRole("button", { name: "Farklı kaydet (yeni not olarak)" }));
    await waitFor(() => expect(useTabsStore.getState().activeId).toBe("b"));
    expect(useTabsStore.getState().tabs[0].doc).toMatchObject({ base: { html: "mine", contentHash: "new-hash" }, dirty: false, removedOnDisk: false });
    expect(commands).toContain("delete_draft");
    expect(ipc.clearPreviewDraft).toHaveBeenCalledWith("a");
  });

  it("closes the removed tab and activates an already-open destination", async () => {
    const commands: string[] = [];
    mockIPC((command) => {
      commands.push(command);
      if (command === "create_note") return created;
      if (command === "read_note") return { ...old, contentHash: "blank-hash" };
      if (command === "save_note") return { metadata: old.metadata, contentHash: "new-hash" };
      if (command === "get_note_tree") return [created];
    });
    useTabsStore.getState().openNote("b");
    useTabsStore.getState().enterEdit("b", { ...old, html: "stale" }, "code");
    useTabsStore.getState().activate("a");
    useTabsStore.getState().markRemoved("a", "A", "");

    render(<ExternalChangeBanner noteId="a" doc={doc()!} />);
    fireEvent.click(screen.getByRole("button", { name: "Farklı kaydet (yeni not olarak)" }));

    await waitFor(() => expect(useTabsStore.getState().tabs.map((tab) => tab.noteId)).toEqual(["b"]));
    expect(useTabsStore.getState().activeId).toBe("b");
    expect(useTabsStore.getState().tabs[0].doc).toMatchObject({
      base: { html: "mine", contentHash: "new-hash" }, draft: { html: "mine" }, dirty: false,
    });
    await waitFor(() => expect(commands).toContain("delete_draft"));
    expect(ipc.clearPreviewDraft).toHaveBeenCalledWith("a");
  });
});
