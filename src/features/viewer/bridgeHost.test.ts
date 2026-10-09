import i18n from "@/i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activateFrame, clearHighlight, createRateLimiter, installBridgeHost, parseBridgeMessage, registerFrame, requestHighlight, requestPrint, resetBridgeHostForTests } from "@/features/viewer/bridgeHost";
import { initNoteOrigin } from "@/lib/noteUrl";
import { ipc } from "@/lib/ipc";
import { subscribeShortcut } from "@/lib/shortcuts/manager";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";



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
  vi.spyOn(ipc, "openExternalUrl").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  resetBridgeHostForTests();
});

describe("parseBridgeMessage", () => {
  it.each([
    undefined, null, 1, {}, "", "assets/", "assets/../outside.pdf", "../assets/file.pdf",
    "assets/%2e%2e/outside.pdf", "assets/a/%2E%2E/file.pdf", "assets/%2F..%2Foutside.pdf",
    "/assets/file.pdf", "C:/assets/file.pdf", "assets/C:file.pdf", "assets/file.pdf:stream",
    "assets/a\\file.pdf", "assets/a%5cfile.pdf", "assets/a\0file.pdf", "assets/a%00file.pdf",
    "file:///assets/file.pdf", "https://evil.test/assets/file.pdf", "//evil.test/assets/file.pdf",
    "assets/./file.pdf", "assets//file.pdf", "assets/file.pdf.", "assets/file.pdf%20",
    "assets/file.pdf?x=1", "assets/file.pdf#page=1", "assets/%zz.pdf", "assets/%FF.pdf",
    `assets/${"a".repeat(4096)}.pdf`,
  ])("rejects an invalid asset path %j", (relPath) => {
    expect(parseBridgeMessage(message({ type: "HTNOTE_OPEN_ASSET", relPath }), frame, NOTE_ORIGIN)).toBeNull();
  });

  it("validates asset messages and ignores a forged note id", () => {
    for (const relPath of ["assets/report.pdf", "./assets/%C4%B0stanbul%20rapor.PDF", "assets/a%25b%23c.txt"]) {
      const data = { type: "HTNOTE_OPEN_ASSET", relPath, noteId: otherId };
      expect(parseBridgeMessage(message(data), frame, NOTE_ORIGIN)).toEqual({ type: data.type, relPath });
      expect(parseBridgeMessage(message(data, otherFrame), frame, NOTE_ORIGIN)).toBeNull();
      expect(parseBridgeMessage(message(data, frame, "https://evil.test"), frame, NOTE_ORIGIN)).toBeNull();
    }
  });
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

it("opens attachments for their registered frame and shares the external open rate limit", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  const open = vi.spyOn(ipc, "openNoteAsset").mockResolvedValue(undefined);
  const unregister = registerFrame(id, frame);
  const unregisterOther = registerFrame(otherId, otherFrame);
  const dispose = installBridgeHost();
  try {
    const data = { type: "HTNOTE_OPEN_ASSET", relPath: "./assets/report.pdf", noteId: otherId };
    window.dispatchEvent(message(data, frame, "https://evil.test"));
    window.dispatchEvent(message({ ...data, relPath: "assets/../outside.pdf" }));
    expect(open).not.toHaveBeenCalled();
    window.dispatchEvent(message(data));
    window.dispatchEvent(message(data));
    window.dispatchEvent(message({ type: "HTNOTE_OPEN_EXTERNAL", url: "https://example.com" }));
    expect(open).toHaveBeenCalledExactlyOnceWith(id, data.relPath);
    expect(ipc.openExternalUrl).not.toHaveBeenCalled();
    window.dispatchEvent(message(data, otherFrame));
    expect(open).toHaveBeenLastCalledWith(otherId, data.relPath);
    vi.advanceTimersByTime(1000);
    window.dispatchEvent(message(data));
    expect(open).toHaveBeenCalledTimes(3);
    unregister();
    vi.advanceTimersByTime(1000);
    window.dispatchEvent(message(data));
    expect(open).toHaveBeenCalledTimes(3);
    await Promise.resolve();
  } finally {
    dispose(); unregister(); unregisterOther(); open.mockRestore();
  }
});

it.each(["ASSET_TYPE_BLOCKED", "ASSET_NOT_FOUND", "IO_ERROR"])("shows an attachment error toast for %s", async (code) => {
  const testFrame = { postMessage: vi.fn() } as unknown as Window;
  const open = vi.spyOn(ipc, "openNoteAsset").mockRejectedValue({ code, message: "details" });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const unregister = registerFrame(id, testFrame);
  const dispose = installBridgeHost();
  try {
    window.dispatchEvent(message({ type: "HTNOTE_OPEN_ASSET", relPath: "assets/file.exe" }, testFrame));
    await vi.waitFor(() => expect(useUiStore.getState().toasts[0]).toMatchObject({ kind: "error", messageKey: `errors.${code}` }));
  } finally {
    dispose(); unregister(); open.mockRestore(); log.mockRestore();
  }
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
    expect(frame.postMessage).toHaveBeenCalledWith({ type: "HTNOTE_THEME", mode: "light", vars: expect.objectContaining({ "--ht-bg": expect.any(String) }), audioLabels: expect.objectContaining({ play: "Oynat", seek: "Ses konumu" }), labels: expect.objectContaining({ locale: "tr", ipblockType: "IP BLOĞU", ipblockGateway: "Ağ geçidi (GW)", ipblockCopyList: "Listeyi kopyala", ipblockSummary: "Blok {{block}} · {{count}} adres (ağ, yayın ve GW hariç)", calcType: "HESAP DEFTERİ", calcReset: "Sıfırla", calcCopyTotal: "Toplamı kopyala", calcTotal: "Toplam", calcError: "Hesaplanamadı", copy: "Kopyala", copied: "Kopyalandı", copyFailed: "Kopyalanamadı", reset: "Varsayılana dön", textboxType: "METİN KUTUSU", checklistType: "KONTROL LİSTESİ", checklistReset: "Sıfırla", copyRemaining: "Kalanları kopyala", checklistProgress: "Tamamlanma oranı", templateType: "ŞABLON DOLDURUCU", templateReset: "Sıfırla", templatePreview: "Önizleme", copyfieldsType: "KOPYALANABİLİR ALANLAR", copyAll: "Tümünü kopyala", copyRow: "Kopyala: {{name}}", copyfieldsRow: "satır {{index}}" }) }, NOTE_ORIGIN);

    window.dispatchEvent(message({ type: "HTNOTE_OPEN_NOTE", id }));
    expect(useTabsStore.getState().activeId).toBe(id);
    expect(useTreeStore.getState().selected).toEqual({ kind: "note", id });
    window.dispatchEvent(message({ type: "HTNOTE_OPEN_NOTE", id: missingId }));
    expect(useUiStore.getState().toasts[0]?.messageKey).toBe("errors.NOTE_NOT_FOUND");

    window.dispatchEvent(message({ type: "HTNOTE_OPEN_EXTERNAL", url: "https://example.com" }));
    window.dispatchEvent(message({ type: "HTNOTE_OPEN_EXTERNAL", url: "https://example.org" }));
    expect(ipc.openExternalUrl).toHaveBeenCalledTimes(1);
    expect(ipc.openExternalUrl).toHaveBeenCalledWith("https://example.com");

    window.dispatchEvent(message({ type: "HTNOTE_SHORTCUT", key: "w", ctrl: true, shift: false, alt: false, meta: false }));
    expect(shortcut).toHaveBeenCalledOnce();

    useSettingsStore.setState({ settings: { theme: "dark" } as Settings });
    expect(frame.postMessage).toHaveBeenLastCalledWith({ type: "HTNOTE_THEME", mode: "dark", vars: expect.objectContaining({ "--ht-bg": expect.any(String) }), audioLabels: expect.objectContaining({ play: "Oynat" }), labels: expect.objectContaining({ copy: "Kopyala" }) }, NOTE_ORIGIN);
    unregister();
    window.dispatchEvent(message({ type: "HTNOTE_READY" }));
    expect(frame.postMessage).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribeShortcut();
    dispose();
    unregister();
  }
});

it("resends localized audio labels and app palette when language changes", async () => {
  const unregister = registerFrame(id, frame);
  const dispose = installBridgeHost();
  document.documentElement.style.setProperty("--app-surface", "test-surface");
  try {
    await i18n.changeLanguage("en");
    expect(frame.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "HTNOTE_THEME", audioLabels: expect.objectContaining({ play: "Play", seek: "Audio position" }),
      labels: expect.objectContaining({ locale: "en", ipblockType: "IP BLOCK", ipblockGateway: "Gateway (GW)", ipblockCopyList: "Copy list", ipblockSummary: "Block {{block}} · {{count}} addresses (excluding network, broadcast and GW)", calcType: "CALCULATION", calcReset: "Reset", calcCopyTotal: "Copy total", calcTotal: "Total", calcError: "Could not calculate", copy: "Copy", copied: "Copied", copyFailed: "Copy failed", reset: "Reset to default", textboxType: "TEXT BOX", checklistType: "CHECKLIST", checklistReset: "Reset", copyRemaining: "Copy remaining", checklistProgress: "Completion progress", templateType: "TEMPLATE", templateReset: "Reset", templatePreview: "Preview", copyfieldsType: "COPY FIELDS", copyAll: "Copy all", copyRow: "Copy: {{name}}", copyfieldsRow: "row {{index}}" }),
      vars: expect.objectContaining({ "--ht-audio-surface": "test-surface" }),
    }), NOTE_ORIGIN);
  } finally {
    dispose(); unregister(); document.documentElement.style.removeProperty("--app-surface");
    await i18n.changeLanguage("tr");
  }
});

it("sends the current dark theme and queued highlights to a replacement window", () => {
  useSettingsStore.setState({ settings: { theme: "dark" } as Settings });
  useTabsStore.getState().openNote(id);
  const unregisterOld = registerFrame(id, frame);
  const dispose = installBridgeHost();
  let unregisterNew = () => {};
  try {
    window.dispatchEvent(message({ type: "HTNOTE_READY" }));
    vi.mocked(frame.postMessage).mockClear();
    unregisterNew = registerFrame(id, otherFrame);
    unregisterOld();
    requestHighlight(id, "yeniden");
    window.dispatchEvent(message({ type: "HTNOTE_READY" }));
    expect(frame.postMessage).not.toHaveBeenCalled();
    expect(otherFrame.postMessage).not.toHaveBeenCalled();
    window.dispatchEvent(message({ type: "HTNOTE_READY" }, otherFrame));
    expect(otherFrame.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "HTNOTE_THEME", mode: "dark" }), NOTE_ORIGIN);
    expect(otherFrame.postMessage).toHaveBeenLastCalledWith({ type: "HTNOTE_HIGHLIGHT", query: "yeniden" }, NOTE_ORIGIN);
    const shortcut = vi.fn();
    const unsubscribe = subscribeShortcut("closeTab", shortcut);
    try {
      window.dispatchEvent(message({ type: "HTNOTE_SHORTCUT", key: "w", ctrl: true, shift: false, alt: false, meta: false }, otherFrame));
      expect(shortcut).toHaveBeenCalledOnce();
      window.dispatchEvent(message({ type: "HTNOTE_OPEN_NOTE", id: missingId }, otherFrame));
      expect(useUiStore.getState().toasts[0]?.messageKey).toBe("errors.NOTE_NOT_FOUND");
    } finally { unsubscribe(); }
  } finally { dispose(); unregisterNew(); unregisterOld(); }
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

it("sends HTNOTE_CONTENT_WIDTH on ready and on settings change", () => {
  useSettingsStore.setState({ settings: { contentWidth: "narrow" } as Settings });
  useTabsStore.getState().openNote(id);
  const unregister = registerFrame(id, frame);
  const dispose = installBridgeHost();
  try {
    window.dispatchEvent(message({ type: "HTNOTE_READY" }));
    expect(frame.postMessage).toHaveBeenCalledWith({ type: "HTNOTE_CONTENT_WIDTH", contentWidth: "narrow" }, NOTE_ORIGIN);

    useSettingsStore.setState({ settings: { contentWidth: "wide" } as Settings });
    expect(frame.postMessage).toHaveBeenCalledWith({ type: "HTNOTE_CONTENT_WIDTH", contentWidth: "wide" }, NOTE_ORIGIN);
  } finally {
    dispose();
    unregister();
  }
});

it("validates hidden frame messages and switches print registration atomically", () => {
  useTabsStore.getState().openNote(id);
  const oldCleanup = registerFrame(id, frame);
  const newCleanup = registerFrame(id, otherFrame, true);
  const dispose = installBridgeHost();
  try {
    window.dispatchEvent(message({ type: "HTNOTE_READY" }));
    window.dispatchEvent(message({ type: "HTNOTE_READY" }, otherFrame));
    expect(otherFrame.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "HTNOTE_THEME" }), NOTE_ORIGIN);
    window.dispatchEvent(message({ type: "HTNOTE_OPEN_NOTE", id: otherId }, otherFrame, "https://evil.test"));
    expect(useTabsStore.getState().activeId).toBe(id);
    window.dispatchEvent(message({ type: "HTNOTE_OPEN_EXTERNAL", url: "https://example.com" }, otherFrame));
    expect(ipc.openExternalUrl).toHaveBeenCalledWith("https://example.com");
    expect(requestPrint(id)).toBe(true);
    expect(frame.postMessage).toHaveBeenLastCalledWith({ type: "HTNOTE_PRINT" }, NOTE_ORIGIN);
    activateFrame(id, otherFrame);
    oldCleanup();
    expect(requestPrint(id)).toBe(true);
    expect(otherFrame.postMessage).toHaveBeenLastCalledWith({ type: "HTNOTE_PRINT" }, NOTE_ORIGIN);
    newCleanup();
    expect(requestPrint(id)).toBe(false);
  } finally { dispose(); oldCleanup(); newCleanup(); }
});
