import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { installAutoSave, notifyAutoSaveChange } from "@/features/editor/autoSave";
import { useDraftAutosave } from "@/features/editor/recoveryDrafts";
import { registerEditorFlush, saveTab } from "@/features/editor/saveTab";
import { saveStatus } from "@/features/editor/saveStatus";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";

const settings: Settings = {
  rootDir: null, lastExportDir: null, theme: "system", motion: "system", language: null,
  sidebarWidth: 260, sidebarVisible: true, tabSizing: "fixed", contentWidth: "comfortable",
  editorSplitRatio: 50, editorLivePreview: true, autoSave: true, backlinksExpanded: true,
  openTabs: [], activeTab: null, expandedFolders: [], onboardingDone: true,
};
const base = { html: "old", css: "", js: "", contentHash: "disk-hash" };
const store = () => useTabsStore.getState();
const doc = () => store().tabs.find((tab) => tab.noteId === "a")!.doc;
const setEnabled = (autoSave: boolean) => useSettingsStore.setState({ settings: { ...settings, autoSave } });
let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  resetTabsStoreForTests();
  setEnabled(true);
  stop = installAutoSave();
});

afterEach(() => {
  stop();
  resetTabsStoreForTests();
  useSettingsStore.setState({ settings: null, status: "idle" });
  clearMocks();
  vi.useRealTimers();
});

function edit(id = "a") {
  store().openNote(id);
  store().enterEdit(id, base, "code");
  store().updateDraft(id, { html: "new" });
}

function mockSave() {
  const save = vi.fn<(args: unknown) => { contentHash: string }>(() => ({ contentHash: "saved-hash" }));
  mockIPC((command, args) => command === "save_note" ? save(args) : undefined);
  return save;
}

it("saves once after two seconds through the existing pipeline and stays in edit mode", async () => {
  const save = mockSave();
  edit();
  await vi.advanceTimersByTimeAsync(1999);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledExactlyOnceWith({ id: "a", payload: { html: "new", css: "", js: "", expectedHash: "disk-hash" } });
  expect(doc()).toMatchObject({ mode: "code", dirty: false, saving: false, lastSavedAt: expect.any(Number) });
  expect(saveStatus(doc())).toBe("saved");
  await vi.advanceTimersByTimeAsync(10000);
  expect(save).toHaveBeenCalledTimes(1);
});

it("debounces rapid successive changes into one save of the latest content", async () => {
  const save = mockSave();
  edit();
  for (const html of ["second", "third", "last"]) {
    await vi.advanceTimersByTimeAsync(1000);
    store().updateDraft("a", { html });
  }
  await vi.advanceTimersByTimeAsync(1999);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ payload: expect.objectContaining({ html: "last" }) }));
});

it("installs no timer and performs no save when disabled", async () => {
  const save = mockSave();
  setEnabled(false);
  edit();
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(10000);
  expect(save).not.toHaveBeenCalled();
});

it("immediately cancels on disable and schedules dirty tabs on enable", async () => {
  const save = mockSave();
  edit();
  await vi.advanceTimersByTimeAsync(1000);
  setEnabled(false);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(10000);
  expect(save).not.toHaveBeenCalled();
  setEnabled(true);
  await vi.advanceTimersByTimeAsync(2000);
  expect(save).toHaveBeenCalledTimes(1);
});

it.each(["automatic", "manual"])("does not overlap an in-flight %s save and reschedules newer edits after success", async (kind) => {
  let finish!: (result: { contentHash: string }) => void;
  const pending = new Promise<{ contentHash: string }>((resolve) => { finish = resolve; });
  const save = vi.fn().mockReturnValueOnce(pending).mockReturnValue({ contentHash: "latest-hash" });
  mockIPC((command, args) => command === "save_note" ? save(args) : undefined);
  edit();
  const manual = kind === "manual" ? saveTab("a") : undefined;
  if (kind === "automatic") await vi.advanceTimersByTimeAsync(2000);
  expect(saveStatus(doc())).toBe("saving");
  store().updateDraft("a", { html: "while-saving" });
  await vi.advanceTimersByTimeAsync(10000);
  expect(save).toHaveBeenCalledTimes(1);
  finish({ contentHash: "saved-hash" });
  await manual;
  await vi.advanceTimersByTimeAsync(1999);
  expect(save).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenLastCalledWith({ id: "a", payload: { html: "while-saving", css: "", js: "", expectedHash: "saved-hash" } });
  expect(save).toHaveBeenCalledTimes(2);
  expect(doc().dirty).toBe(false);
});

it("flushes pending visual content through the same save pipeline", async () => {
  const save = mockSave();
  edit();
  store().switchMode("a", "visual");
  const unregister = registerEditorFlush("a", () => store().updateDraft("a", { html: "pending-visual" }));
  try {
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ payload: expect.objectContaining({ html: "pending-visual" }) }));
  } finally {
    unregister();
  }
});

it("waits for visual editing to stop even while serialization is still pending", async () => {
  const save = mockSave();
  edit();
  store().switchMode("a", "visual");
  const unregister = registerEditorFlush("a", () => store().updateDraft("a", { html: "latest-visual" }));
  try {
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      notifyAutoSaveChange("a");
    }
    await vi.advanceTimersByTimeAsync(1999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ payload: expect.objectContaining({ html: "latest-visual" }) }));
  } finally {
    unregister();
  }
});

it("shows the existing conflict state without overwriting or retrying until resolution", async () => {
  const save = vi.fn().mockRejectedValueOnce({ code: "CONFLICT", message: "disk changed" }).mockReturnValue({ contentHash: "saved-hash" });
  mockIPC((command, args) => {
    if (command === "save_note") return save(args);
    if (command === "read_note") return { ...base, html: "external", contentHash: "external-hash" };
  });
  edit();
  await vi.advanceTimersByTimeAsync(2000);
  expect(doc()).toMatchObject({ dirty: true, externalConflict: "external-hash", draft: { html: "new" } });
  store().updateDraft("a", { html: "my-latest" });
  setEnabled(false);
  setEnabled(true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].payload.expectedHash).toBe("disk-hash");
  store().keepMine("a", { ...base, html: "external", contentHash: "external-hash" });
  await vi.advanceTimersByTimeAsync(2000);
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0].payload.expectedHash).toBe("external-hash");
});

it("does not start a save for a known external conflict or removed note", async () => {
  const save = mockSave();
  edit();
  store().markConflict("a", "external-hash");
  await vi.advanceTimersByTimeAsync(10000);
  store().markRemoved("a", "A", "");
  store().updateDraft("a", { html: "latest" });
  await vi.advanceTimersByTimeAsync(10000);
  expect(save).not.toHaveBeenCalled();
});

it.each(["IO_ERROR", "CONFLICT"])("preserves drafts and does not retry %s even if conflict read fails", async (code) => {
  const save = vi.fn().mockRejectedValue({ code, message: "failed" });
  const recovery = vi.fn();
  mockIPC((command, args) => {
    if (command === "save_note") return save(args);
    if (command === "read_note") throw { code: "IO_ERROR", message: "read failed" };
    if (command === "write_draft" || command === "delete_draft") return recovery(command, args);
  });
  const hook = renderHook(() => useDraftAutosave());
  try {
    act(() => edit());
    await act(async () => { await vi.advanceTimersByTimeAsync(12000); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(doc()).toMatchObject({ dirty: true, saving: false, draft: { html: "new" } });
    expect(recovery).toHaveBeenCalledExactlyOnceWith("write_draft", expect.objectContaining({ payload: expect.objectContaining({ html: "new" }) }));
    setEnabled(false);
    setEnabled(true);
    store().updateDraft("a", {});
    await vi.advanceTimersByTimeAsync(10000);
    expect(save).toHaveBeenCalledTimes(1);
    act(() => store().updateDraft("a", { html: "another-edit" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(save).toHaveBeenCalledTimes(code === "CONFLICT" ? 1 : 2);
    if (code === "CONFLICT") expect(doc().externalConflict).toBe("disk-hash");
  } finally {
    hook.unmount();
  }
});

it.each(["cancel", "clean", "close", "stop", "save"])("cancels a pending timer on %s", async (reason) => {
  const save = mockSave();
  edit();
  await vi.advanceTimersByTimeAsync(1000);
  if (reason === "cancel") store().cancelEdit("a");
  if (reason === "clean") store().updateDraft("a", { html: "old" });
  if (reason === "close") useTabsStore.setState({ tabs: [], activeId: null });
  if (reason === "stop") stop();
  if (reason === "save") await saveTab("a");
  await vi.advanceTimersByTimeAsync(10000);
  expect(save).toHaveBeenCalledTimes(reason === "save" ? 1 : 0);
});

it("independently saves dirty background tabs while leaving read-only tabs alone", async () => {
  const save = mockSave();
  edit("a");
  edit("b");
  store().openNote("view");
  await vi.advanceTimersByTimeAsync(2000);
  expect(save.mock.calls.map(([args]) => (args as { id: string }).id)).toEqual(["a", "b"]);
  expect(store().activeId).toBe("view");
});
