import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { discardTab, requestUnsavedDecision, resolveUnsaved, setDiscardRecoveryDraftHook } from "@/features/editor/unsavedGuard";
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
    expect(await resolveUnsaved(["a"])).toMatchObject({ resolved: new Set(["a"]), cancelled: false });
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
    expect(await first).toMatchObject({ resolved: new Set(["a", "b"]), cancelled: false });
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
    expect(await pending).toMatchObject({ resolved: new Set(["a"]), cancelled: false });
    expect(useTabsStore.getState().isDirty("b")).toBe(true);
    expect(useUiStore.getState().toasts.slice(-1)[0]?.messageKey).toBe("errors.IO_ERROR");
  });

  it("discards only on explicit discard and keeps changes on cancel", async () => {
    dirty("a");
    const clear = vi.fn();
    mockIPC((command) => { if (command === "clear_preview_draft") clear(); });
    const cancelled = resolveUnsaved(["a"]); decide("cancel");
    expect(await cancelled).toMatchObject({ resolved: new Set(), cancelled: true });
    expect(useTabsStore.getState().isDirty("a")).toBe(true);
    const discarded = resolveUnsaved(["a"]); decide("discard");
    expect(await discarded).toMatchObject({ resolved: new Set(["a"]), cancelled: false });
    expect(clear).toHaveBeenCalledOnce();
  });

  it("queues a close request for notes absent from the open dialog", async () => {
    dirty("a"); dirty("b");
    mockIPC((command) => command === "save_note" ? { contentHash: "new" } : undefined);
    const first = resolveUnsaved(["a"]);
    const second = resolveUnsaved(["a", "b"]);
    expect(useUiStore.getState().unsavedDialog?.noteIds).toEqual(["a"]);
    decide("save");
    expect(await first).toMatchObject({ resolved: new Set(["a"]), cancelled: false });
    await vi.waitFor(() => expect(useUiStore.getState().unsavedDialog?.noteIds).toEqual(["b"]));
    expect(useTabsStore.getState().isDirty("b")).toBe(true);
    decide("discard");
    expect(await second).toMatchObject({ resolved: new Set(["a", "b"]), cancelled: false });
    expect(useTabsStore.getState().isDirty("b")).toBe(false);
  });

  it("serializes overlapping requests without waiting on their own resolution", async () => {
    dirty("a"); dirty("b"); dirty("c");
    mockIPC((command) => command === "save_note" ? { contentHash: "new" } : undefined);
    const first = resolveUnsaved(["a"]);
    const second = resolveUnsaved(["a", "b"]);
    const third = resolveUnsaved(["b", "c"]);
    decide("save");
    expect(await first).toMatchObject({ resolved: new Set(["a"]), cancelled: false });
    await vi.waitFor(() => expect(useUiStore.getState().unsavedDialog?.noteIds).toEqual(["b"]));
    decide("save");
    expect(await second).toMatchObject({ resolved: new Set(["a", "b"]), cancelled: false });
    await vi.waitFor(() => expect(useUiStore.getState().unsavedDialog?.noteIds).toEqual(["c"]));
    decide("discard");
    expect(await third).toMatchObject({ resolved: new Set(["b", "c"]), cancelled: false });
  });

  it("asks only about new dirty notes across queued requests after a failed save", async () => {
    dirty("a"); dirty("b"); dirty("c");
    mockIPC((command, args) => {
      if (command === "save_note" && (args as { id: string }).id === "a") throw { code: "IO_ERROR" };
      if (command === "save_note") return { contentHash: "new" };
    });
    const first = resolveUnsaved(["a"]);
    const second = resolveUnsaved(["a", "b"]);
    const third = resolveUnsaved(["a", "b", "c"]);
    const fourth = resolveUnsaved(["a"]);
    decide("save");
    expect(await first).toMatchObject({ resolved: new Set(), cancelled: false });
    await vi.waitFor(() => expect(useUiStore.getState().unsavedDialog?.noteIds).toEqual(["b"]));
    decide("discard");
    expect(await second).toMatchObject({ resolved: new Set(["b"]), cancelled: false });
    await vi.waitFor(() => expect(useUiStore.getState().unsavedDialog?.noteIds).toEqual(["c"]));
    decide("discard");
    expect(await third).toMatchObject({ resolved: new Set(["b", "c"]), cancelled: false });
    expect(await fourth).toMatchObject({ resolved: new Set(), cancelled: false });
    expect(useTabsStore.getState().isDirty("a")).toBe(true);
    expect(useUiStore.getState().unsavedDialog).toBeNull();
  });

  it("discards even when preview and recovery cleanup fail", async () => {
    dirty("a");
    mockIPC((command) => { if (command === "clear_preview_draft") throw new Error("preview"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const recovery = vi.fn().mockRejectedValue(new Error("recovery"));
    const unregister = setDiscardRecoveryDraftHook(recovery);
    try {
      expect(await discardTab("a")).toBe(true);
      expect(useTabsStore.getState().isDirty("a")).toBe(false);
      expect(recovery).toHaveBeenCalledWith("a");
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      unregister();
      warn.mockRestore();
    }
  });
});
