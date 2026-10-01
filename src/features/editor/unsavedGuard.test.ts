import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestUnsavedDecision, resolveUnsaved } from "@/features/editor/unsavedGuard";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";

const base = { html: "old", css: null, js: null, contentHash: "hash" };
function dirty(id: string) {
  const store = useTabsStore.getState();
  store.openNote(id);
  store.enterEdit(id, base, "code");
  store.updateDraft(id, { html: `new ${id}` });
}
function decide(decision: "save" | "discard" | "cancel") {
  useUiStore.getState().unsavedDialog?.resolve(decision);
}

beforeEach(() => {
  resetTabsStoreForTests();
  useUiStore.setState({ unsavedDialog: null, toasts: [] });
});

describe("unsaved guard", () => {
  it("passes clean tabs without a dialog", async () => {
    useTabsStore.getState().openNote("a");
    expect(await resolveUnsaved(["a"])).toEqual(new Set(["a"]));
    expect(useUiStore.getState().unsavedDialog).toBeNull();
  });

  it("uses one dialog and saves multiple notes with their expected hashes", async () => {
    dirty("a"); dirty("b");
    const calls: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "save_note") { calls.push(args); return { contentHash: "new" }; }
    });
    const first = resolveUnsaved(["a", "b"]);
    expect(useUiStore.getState().unsavedDialog?.noteIds).toEqual(["a", "b"]);
    expect(requestUnsavedDecision(["a"])).toBe(requestUnsavedDecision(["b"]));
    decide("save");
    expect(await first).toEqual(new Set(["a", "b"]));
    expect(calls).toMatchObject([
      { id: "a", payload: { expectedHash: "hash" } },
      { id: "b", payload: { expectedHash: "hash" } },
    ]);
  });

  it("keeps a failed note dirty and reports an error", async () => {
    dirty("a"); dirty("b");
    mockIPC((command, args) => {
      if (command === "save_note" && (args as { id: string }).id === "b") throw { code: "IO_ERROR" };
      if (command === "save_note") return { contentHash: "new" };
    });
    const pending = resolveUnsaved(["a", "b"]);
    decide("save");
    expect(await pending).toEqual(new Set(["a"]));
    expect(useTabsStore.getState().isDirty("b")).toBe(true);
    expect(useUiStore.getState().toasts.slice(-1)[0]?.messageKey).toBe("errors.IO_ERROR");
  });

  it("discards only on explicit discard and keeps changes on cancel", async () => {
    dirty("a");
    const clear = vi.fn();
    mockIPC((command) => { if (command === "clear_preview_draft") clear(); });
    const cancelled = resolveUnsaved(["a"]); decide("cancel");
    expect(await cancelled).toEqual(new Set());
    expect(useTabsStore.getState().isDirty("a")).toBe(true);
    const discarded = resolveUnsaved(["a"]); decide("discard");
    expect(await discarded).toEqual(new Set(["a"]));
    expect(clear).toHaveBeenCalledOnce();
  });

  it("does not apply an open dialog's decision to a note absent from its list", async () => {
    dirty("a"); dirty("b");
    mockIPC((command) => command === "save_note" ? { contentHash: "new" } : undefined);
    const first = resolveUnsaved(["a"]);
    expect(await resolveUnsaved(["b"])).toEqual(new Set());
    expect(useUiStore.getState().unsavedDialog?.noteIds).toEqual(["a"]);
    decide("save");
    expect(await first).toEqual(new Set(["a"]));
    expect(useTabsStore.getState().isDirty("b")).toBe(true);
  });
});
