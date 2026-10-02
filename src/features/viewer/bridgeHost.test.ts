import { openUrl } from "@tauri-apps/plugin-opener";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearHighlight, createRateLimiter, installBridgeHost, parseBridgeMessage, registerFrame, requestHighlight, requestPrint, resetBridgeHostForTests } from "@/features/viewer/bridgeHost";
import { initNoteOrigin } from "@/lib/noteUrl";
import { subscribeShortcut } from "@/lib/shortcuts/manager";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const missingId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOTE_ORIGIN = "http://127.0.0.1:54321";
const frame = { postMessage: vi.fn() } as unknown as Window;
const otherFrame = { postMessage: vi.fn() } as unknown as Window;

function message(data: unknown, source: Window = frame, origin = NOTE_ORIGIN): MessageEvent {
  return new MessageEvent("message", { data, source, origin });
}

beforeEach(() => {
  initNoteOrigin(NOTE_ORIGIN);
  resetBridgeHostForTests();
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  useUiStore.setState({ toasts: [] });
  useSettingsStore.setState({ settings: { theme: "light" } as Settings });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  resetBridgeHostForTests();
});

describe("parseBridgeMessage", () => {
  it.each([
    ["wrong source", message({ type: "HTNOTE_READY" }, otherFrame)],
    ["wrong origin", message({ type: "HTNOTE_READY" }, frame, "https://evil.test")],
    ["unknown type", message({ type: "HTNOTE_UNKNOWN" })],
    ["non-object", message("HTNOTE_READY")],
    ["array", message([{ type: "HTNOTE_READY" }])],
    ["bad note payload", message({ type: "HTNOTE_OPEN_NOTE", id: 1 })],
    ["invalid uuid", message({ type: "HTNOTE_OPEN_NOTE", id: "not-uuid" })],
    ["invalid ready id", message({ type: "HTNOTE_READY", noteId: "wrong" })],
    ["bad shortcut", message({ type: "HTNOTE_SHORTCUT", key: "w", ctrl: 1, shift: false, alt: false, meta: false })],
    ["javascript url", message({ type: "HTNOTE_OPEN_EXTERNAL", url: "javascript:alert(1)" })],
    ["file url", message({ type: "HTNOTE_OPEN_EXTERNAL", url: "file:///tmp/a" })],
    ["data url", message({ type: "HTNOTE_OPEN_EXTERNAL", url: "data:text/html,a" })],
    ["relative url", message({ type: "HTNOTE_OPEN_EXTERNAL", url: "/somewhere" })],
    ["malformed url", message({ type: "HTNOTE_OPEN_EXTERNAL", url: "http://[" })],
  ])("rejects %s", (_name, event) => {
    expect(parseBridgeMessage(event, frame, NOTE_ORIGIN)).toBeNull();
  });

  it("accepts valid messages and drops unused fields", () => {
    expect(parseBridgeMessage(message({ type: "HTNOTE_READY", noteId: id, extra: "ignored" }), frame, NOTE_ORIGIN)).toEqual({ type: "HTNOTE_READY" });
    expect(parseBridgeMessage(message({ type: "HTNOTE_OPEN_NOTE", id, extra: "ignored" }), frame, NOTE_ORIGIN)).toEqual({ type: "HTNOTE_OPEN_NOTE", id });
    for (const url of ["https://example.com", "http://example.com", "mailto:hello@example.com"]) {
      expect(parseBridgeMessage(message({ type: "HTNOTE_OPEN_EXTERNAL", url }), frame, NOTE_ORIGIN)).toEqual({ type: "HTNOTE_OPEN_EXTERNAL", url });
    }
    expect(parseBridgeMessage(message({ type: "HTNOTE_SHORTCUT", key: "w", ctrl: true, shift: false, alt: false, meta: false }), frame, NOTE_ORIGIN))
      .toEqual({ type: "HTNOTE_SHORTCUT", input: { key: "w", ctrl: true, shift: false, alt: false, meta: false } });
    expect(parseBridgeMessage(message({ type: "HTNOTE_SCROLL", scrollY: 23 }), frame, NOTE_ORIGIN))
      .toEqual({ type: "HTNOTE_SCROLL", scrollY: 23 });
    expect(parseBridgeMessage(message({ type: "HTNOTE_SCROLL", scrollY: -1 }), frame, NOTE_ORIGIN)).toBeNull();
  });
});

it("limits external opens independently per frame for one second", () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const allow = createRateLimiter(1000);
  expect(allow(frame)).toBe(true);
  expect(allow(frame)).toBe(false);
  expect(allow(otherFrame)).toBe(true);
  vi.advanceTimersByTime(999);
  expect(allow(frame)).toBe(false);
  vi.advanceTimersByTime(1);
  expect(allow(frame)).toBe(true);
});

it("opens an internal link in a new tab and selects the linked note", () => {
  useTreeStore.setState({ tree: [
    { type: "note", id: otherId, title: "First", relPath: "First", isFavorite: false, tags: [], updatedAt: "2026-01-01T00:00:00Z" },
    { type: "note", id, title: "Linked", relPath: "Linked", isFavorite: false, tags: [], updatedAt: "2026-01-01T00:00:00Z" },
  ] });
  useTabsStore.getState().openNote(otherId);
  const unregister = registerFrame(otherId, frame);
  const dispose = installBridgeHost();
  try {
    window.dispatchEvent(message({ type: "HTNOTE_OPEN_NOTE", id }));
    expect(useTabsStore.getState().tabs.map((tab) => tab.noteId)).toEqual([otherId, id]);
    expect(useTabsStore.getState().activeId).toBe(id);
    expect(useTreeStore.getState().selected).toEqual({ kind: "note", id });
  } finally {
    dispose();
    unregister();
  }
});

it("handles registered messages and resends theme on settings change", () => {
  useTreeStore.setState({ tree: [{ type: "note", id, title: "A", relPath: "A", isFavorite: false, tags: [], updatedAt: "2026-01-01T00:00:00Z" }] });
  const unregister = registerFrame(id, frame);
  const dispose = installBridgeHost();
  const shortcut = vi.fn();
  const unsubscribeShortcut = subscribeShortcut("closeTab", shortcut);
  try {
    window.dispatchEvent(message({ type: "HTNOTE_READY", noteId: id }, otherFrame));
    expect(frame.postMessage).not.toHaveBeenCalled();
    window.dispatchEvent(message({ type: "HTNOTE_READY", noteId: id }));
    expect(frame.postMessage).toHaveBeenCalledWith({ type: "HTNOTE_THEME", mode: "light", vars: expect.objectContaining({ "--ht-bg": expect.any(String) }) }, NOTE_ORIGIN);

    window.dispatchEvent(message({ type: "HTNOTE_OPEN_NOTE", id }));
    expect(useTabsStore.getState().activeId).toBe(id);
    expect(useTreeStore.getState().selected).toEqual({ kind: "note", id });
    window.dispatchEvent(message({ type: "HTNOTE_OPEN_NOTE", id: missingId }));
    expect(useUiStore.getState().toasts[0]?.messageKey).toBe("errors.NOTE_NOT_FOUND");

    window.dispatchEvent(message({ type: "HTNOTE_OPEN_EXTERNAL", url: "https://example.com" }));
    window.dispatchEvent(message({ type: "HTNOTE_OPEN_EXTERNAL", url: "https://example.org" }));
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith("https://example.com");

    window.dispatchEvent(message({ type: "HTNOTE_SHORTCUT", key: "w", ctrl: true, shift: false, alt: false, meta: false }));
    expect(shortcut).toHaveBeenCalledOnce();

    useSettingsStore.setState({ settings: { theme: "dark" } as Settings });
    expect(frame.postMessage).toHaveBeenLastCalledWith({ type: "HTNOTE_THEME", mode: "dark", vars: expect.objectContaining({ "--ht-bg": expect.any(String) }) }, NOTE_ORIGIN);
    unregister();
    window.dispatchEvent(message({ type: "HTNOTE_READY" }));
    expect(frame.postMessage).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribeShortcut();
    dispose();
    unregister();
  }
});

it("queues highlights until a validated ready message, then dispatches immediately", () => {
  useTabsStore.getState().openNote(id);
  const unregister = registerFrame(id, frame);
  const dispose = installBridgeHost();
  try {
    requestHighlight(id, "ilk");
    expect(frame.postMessage).not.toHaveBeenCalled();
    window.dispatchEvent(message({ type: "HTNOTE_READY" }, frame, "https://evil.test"));
    expect(frame.postMessage).not.toHaveBeenCalled();
    window.dispatchEvent(message({ type: "HTNOTE_READY" }));
    expect(frame.postMessage).toHaveBeenCalledWith({ type: "HTNOTE_HIGHLIGHT", query: "ilk" }, NOTE_ORIGIN);
    clearHighlight(id);
    requestHighlight(id, "sonra");
    expect(frame.postMessage).toHaveBeenLastCalledWith({ type: "HTNOTE_HIGHLIGHT", query: "sonra" }, NOTE_ORIGIN);
    expect(frame.postMessage).toHaveBeenNthCalledWith(3, { type: "HTNOTE_CLEAR_HIGHLIGHT" }, NOTE_ORIGIN);
    clearHighlight(id);
    expect(frame.postMessage).toHaveBeenLastCalledWith({ type: "HTNOTE_CLEAR_HIGHLIGHT" }, NOTE_ORIGIN);
  } finally { dispose(); unregister(); }
});

it("prints only registered frames after a validated ready message", () => {
  const unregister = registerFrame(id, frame);
  const dispose = installBridgeHost();
  try {
    expect(requestPrint(id)).toBe(false);
    expect(requestPrint(missingId)).toBe(false);
    expect(frame.postMessage).not.toHaveBeenCalled();
    window.dispatchEvent(message({ type: "HTNOTE_READY" }, frame, "https://evil.test"));
    expect(requestPrint(id)).toBe(false);
    window.dispatchEvent(message({ type: "HTNOTE_READY" }));
    expect(requestPrint(id)).toBe(true);
    expect(frame.postMessage).toHaveBeenCalledWith({ type: "HTNOTE_PRINT" }, NOTE_ORIGIN);
    expect(requestPrint(missingId)).toBe(false);
    unregister();
    expect(requestPrint(id)).toBe(false);
  } finally { dispose(); unregister(); }
});

it("drops a queued highlight when edit mode clears it", () => {
  useTabsStore.getState().openNote(id);
  const unregister = registerFrame(id, frame);
  const dispose = installBridgeHost();
  try {
    requestHighlight(id, "sil");
    clearHighlight(id);
    window.dispatchEvent(message({ type: "HTNOTE_READY" }));
    expect(frame.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "HTNOTE_HIGHLIGHT" }), NOTE_ORIGIN);
  } finally { dispose(); unregister(); }
});

it("drops a queued highlight after edit mode starts before frame registration", () => {
  useTabsStore.getState().openNote(id);
  requestHighlight(id, "sil");
  useTabsStore.getState().enterEdit(id, { html: "", css: "", js: "", contentHash: "hash" });
  const unregister = registerFrame(id, frame);
  const dispose = installBridgeHost();
  try {
    window.dispatchEvent(message({ type: "HTNOTE_READY" }));
    expect(frame.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "HTNOTE_HIGHLIGHT" }), NOTE_ORIGIN);
    requestHighlight(id, "yeniden");
    expect(frame.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "HTNOTE_HIGHLIGHT" }), NOTE_ORIGIN);
  } finally { dispose(); unregister(); }
});

it("clears a highlight queued before any frame registers", () => {
  useTabsStore.getState().openNote(id);
  requestHighlight(id, "sil");
  clearHighlight(id);
  const unregister = registerFrame(id, frame);
  const dispose = installBridgeHost();
  try {
    window.dispatchEvent(message({ type: "HTNOTE_READY" }));
    expect(frame.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "HTNOTE_HIGHLIGHT" }), NOTE_ORIGIN);
  } finally { dispose(); unregister(); }
});
