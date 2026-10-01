import { mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDocState, enterEdit, markSaving, updateDraft } from "@/features/editor/docState";
import { decideExternalChange, handleExternalChanges } from "@/features/editor/externalChange";
import { saveTab } from "@/features/editor/saveTab";
import { ipc } from "@/lib/ipc";
import type { FsChangePayload, NoteData } from "@/lib/types";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

const base: NoteData = {
  metadata: { id: "a", title: "A", createdAt: "", updatedAt: "", isFavorite: false, tags: [], hasCustomCss: false, hasCustomJs: false },
  html: "old", css: "", js: "", contentHash: "old-hash",
};
const disk = { ...base, html: "disk", contentHash: "disk-hash" };
const changed: FsChangePayload = { changedNoteIds: ["a"], removedNoteIds: [], treeChanged: false, trashChanged: false };
const removed: FsChangePayload = { ...changed, changedNoteIds: [], removedNoteIds: ["a"] };
const doc = () => useTabsStore.getState().tabs.find((tab) => tab.noteId === "a")?.doc;

beforeEach(() => {
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  useUiStore.setState({ toasts: [] });
  useTabsStore.getState().openNote("a");
  vi.spyOn(ipc, "clearPreviewDraft").mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetTabsStoreForTests();
  resetTreeStoreForTests();
});

describe("decideExternalChange", () => {
  const view = { ...createDocState(), base };
  const clean = enterEdit(createDocState(), base);
  const dirty = updateDraft(clean, { html: "mine" });
  it.each([
    [view, "old-hash", false, "ignore"],
    [view, "disk-hash", false, "silentReload"],
    [clean, "old-hash", false, "ignore"],
    [clean, "disk-hash", false, "silentReload"],
    [dirty, "old-hash", false, "ignore"],
    [dirty, "disk-hash", false, "showConflictBanner"],
    [markSaving(dirty), "disk-hash", false, "ignore"],
    [view, null, true, "closeTab"],
    [clean, null, true, "closeTab"],
    [dirty, null, true, "showRemovedBanner"],
    [markSaving(dirty), null, true, "showRemovedBanner"],
  ] as const)("decides %s / %s / removed %s", (state, hash, isRemoved, expected) => {
    expect(decideExternalChange(state, hash, isRemoved)).toBe(expected);
  });
});

describe("external fs changes", () => {
  it("reloads a clean note and marks a dirty note without changing its draft", async () => {
    mockIPC((command) => command === "read_note" ? disk : undefined);
    useTabsStore.getState().enterEdit("a", base, "code");
    await handleExternalChanges(changed);
    expect(doc()).toMatchObject({ base: disk, draft: { html: "disk" }, baseVersion: 1, dirty: false });
    useTabsStore.getState().updateDraft("a", { html: "mine" });
    mockIPC((command) => command === "read_note" ? { ...disk, contentHash: "newer" } : undefined);
    await handleExternalChanges(changed);
    expect(doc()).toMatchObject({ draft: { html: "mine" }, externalConflict: "newer" });
    useTabsStore.getState().keepMine("a");
    expect(doc()).toMatchObject({ base: { contentHash: "newer" }, draft: { html: "mine" }, externalConflict: null });
  });

  it("waits for an in-flight save and ignores its own hash", async () => {
    useTabsStore.getState().enterEdit("a", base, "code");
    useTabsStore.getState().updateDraft("a", { html: "mine" });
    useTabsStore.getState().markSaving("a");
    const read = vi.fn(() => ({ ...base, html: "mine", contentHash: "saved" }));
    mockIPC((command) => command === "read_note" ? read() : undefined);
    const pending = handleExternalChanges(changed);
    expect(read).not.toHaveBeenCalled();
    useTabsStore.getState().saveSucceeded("a", { ...base, html: "mine", contentHash: "saved" });
    await pending;
    expect(read).toHaveBeenCalledOnce();
    expect(doc()).toMatchObject({ externalConflict: null, baseVersion: 0 });
  });

  it("turns save CONFLICT into a banner with the current disk hash", async () => {
    useTabsStore.getState().enterEdit("a", base, "code");
    useTabsStore.getState().updateDraft("a", { html: "mine" });
    mockIPC((command) => {
      if (command === "save_note") throw { code: "CONFLICT" };
      if (command === "read_note") return disk;
    });
    expect(await saveTab("a")).toBe(false);
    expect(doc()).toMatchObject({ externalConflict: "disk-hash", draft: { html: "mine" } });
  });

  it("closes a removed clean tab and preserves a removed dirty tab", async () => {
    await handleExternalChanges(removed);
    expect(doc()).toBeUndefined();
    expect(useUiStore.getState().toasts.slice(-1)[0]?.messageKey).toBe("external.closed");
    useTabsStore.getState().openNote("a");
    useTabsStore.getState().enterEdit("a", base, "code");
    useTabsStore.getState().updateDraft("a", { html: "mine" });
    await handleExternalChanges(removed);
    expect(doc()).toMatchObject({ removedOnDisk: true, draft: { html: "mine" } });
    useTabsStore.getState().replaceMissing([]);
    expect(doc()).toBeDefined();
  });
});
