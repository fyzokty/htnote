import { mockIPC } from "@tauri-apps/api/mocks";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteRecoveryDraft, ORPHAN_TTL, selectRecoveryCandidates, useDraftAutosave } from "@/features/editor/recoveryDrafts";
import type { NoteNode, RecoveryDraft } from "@/lib/types";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";

const now = Date.parse("2026-10-01T12:00:00Z");
const note: NoteNode = { type: "note", id: "a", title: "A", relPath: "A", isFavorite: false, tags: [], updatedAt: new Date(now - 1000).toISOString() };
const draft = (id: string, time: number): RecoveryDraft => ({ id, html: "new", css: "", js: "", baseHash: "old", savedAt: new Date(time).toISOString() });

afterEach(() => { vi.useRealTimers(); resetTabsStoreForTests(); });

describe("recovery candidates", () => {
  it("selects newer indexed drafts and cleans only old drafts", () => {
    const result = selectRecoveryCandidates([
      draft("a", now), draft("a", now - 2000), draft("orphan-new", now - ORPHAN_TTL + 1), draft("orphan-old", now - ORPHAN_TTL - 1),
    ], [note], now);
    expect(result.candidates.map((item) => item.draft.savedAt)).toEqual([new Date(now).toISOString()]);
    expect(result.toDelete).toEqual(["a", "orphan-old"]);
  });
});

describe("draft autosave", () => {
  it("debounces dirty changes and deletes after cleanup", async () => {
    vi.useFakeTimers();
    const handler = vi.fn(() => undefined);
    mockIPC(handler);
    const hook = renderHook(() => useDraftAutosave());
    const store = useTabsStore.getState();
    act(() => {
      store.openNote("a");
      store.enterEdit("a", { html: "old", css: "", js: "", contentHash: "hash" }, "code");
      store.updateDraft("a", { html: "new" });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(4999); });
    expect(handler).not.toHaveBeenCalledWith("write_draft", expect.anything());
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(handler).toHaveBeenCalledWith("write_draft", expect.objectContaining({ id: "a", payload: expect.objectContaining({ html: "new", baseHash: "hash" }) }));
    await deleteRecoveryDraft("a");
    expect(handler).toHaveBeenCalledWith("delete_draft", { id: "a" });
    hook.unmount();
  });
});
