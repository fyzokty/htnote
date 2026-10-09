import i18n from "@/i18n";

import { notifyError } from "@/lib/errors";
import { ipc } from "@/lib/ipc";
import { getNoteOrigin } from "@/lib/noteUrl";
import { dispatchShortcut } from "@/lib/shortcuts/manager";
import { getPlatform } from "@/lib/platform";
import { matchShortcut } from "@/lib/shortcuts/registry";
import type { KeyInput } from "@/lib/shortcuts/registry";
import { getNoteThemeVars, resolveThemeMode } from "@/lib/theme";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

export type BridgeMessage =
  | { type: "HTNOTE_READY" }
  | { type: "HTNOTE_OPEN_NOTE"; id: string }
  | { type: "HTNOTE_OPEN_EXTERNAL"; url: string }
  | { type: "HTNOTE_OPEN_ASSET"; relPath: string }
  | { type: "HTNOTE_SHORTCUT"; input: KeyInput }
  | { type: "HTNOTE_SCROLL"; scrollY: number };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const frames = new Map<string, Window>();
const stagedFrames = new Map<Window, string>();
const readyFrames = new Set<Window>();
const pendingHighlights = new Map<string, string>();

export function requestHighlight(noteId: string, query: string) {
  if (useTabsStore.getState().tabs.find((tab) => tab.noteId === noteId)?.doc.mode !== "view") return;
  pendingHighlights.set(noteId, query);
  const frame = frames.get(noteId);
  if (frame && readyFrames.has(frame)) {
    frame.postMessage({ type: "HTNOTE_HIGHLIGHT", query }, getNoteOrigin());
    pendingHighlights.delete(noteId);
  }
}

export function clearHighlight(noteId: string) {
  pendingHighlights.delete(noteId);
  const frame = frames.get(noteId);
  if (frame && readyFrames.has(frame)) frame.postMessage({ type: "HTNOTE_CLEAR_HIGHLIGHT" }, getNoteOrigin());
}

export function requestPrint(noteId: string): boolean {
  const frame = frames.get(noteId);
  if (!frame || !readyFrames.has(frame)) return false;
  frame.postMessage({ type: "HTNOTE_PRINT" }, getNoteOrigin());
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseBridgeMessage(event: MessageEvent, expectedWindow: Window, noteOrigin: string): BridgeMessage | null {
  if (event.source !== expectedWindow || event.origin !== noteOrigin || !isRecord(event.data)) return null;
  const data = event.data;
  switch (data.type) {
    case "HTNOTE_READY":
      return data.noteId === undefined || (typeof data.noteId === "string" && uuidPattern.test(data.noteId))
        ? { type: "HTNOTE_READY" } : null;
    case "HTNOTE_OPEN_NOTE":
      return typeof data.id === "string" && uuidPattern.test(data.id)
        ? { type: "HTNOTE_OPEN_NOTE", id: data.id } : null;
    case "HTNOTE_OPEN_ASSET": {
      if (typeof data.relPath !== "string" || !data.relPath || data.relPath.length > 4096
        || /[?#]/.test(data.relPath)) return null;
      try {
        const path = decodeURIComponent(data.relPath).replace(/^\.\//, "");
        if (!path.startsWith("assets/") || /[\\:]/.test(path)
          || [...path].some((char) => char.charCodeAt(0) < 32 || (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159))
          || path.split("/").some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part))) return null;
        // Kodlama Rust'ta da yalnızca bir kez çözülür; mesajdaki not kimliği kullanılmaz.
        return { type: "HTNOTE_OPEN_ASSET", relPath: data.relPath };
      } catch {
        return null;
      }
    }
    case "HTNOTE_OPEN_EXTERNAL": {
      if (typeof data.url !== "string") return null;
      try {
        const url = new URL(data.url);
        if (!(["http:", "https:", "mailto:"].includes(url.protocol))) return null;
        // URL ayrıştırıcısının göreli veya bozuk girdileri düzeltmesine izin verilmez.
        if (!/^(https?:\/\/|mailto:)/i.test(data.url)) return null;
        return { type: "HTNOTE_OPEN_EXTERNAL", url: data.url };
      } catch {
        return null;
      }
    }
    case "HTNOTE_SHORTCUT":
      if (typeof data.key !== "string" || !data.key || data.key.length > 32
        || typeof data.ctrl !== "boolean" || typeof data.shift !== "boolean"
        || typeof data.alt !== "boolean" || typeof data.meta !== "boolean") return null;
      return { type: "HTNOTE_SHORTCUT", input: {
        key: data.key, ctrl: data.ctrl, shift: data.shift, alt: data.alt, meta: data.meta,
      } };
    case "HTNOTE_SCROLL":
      return typeof data.scrollY === "number" && Number.isFinite(data.scrollY) && data.scrollY >= 0
        ? { type: "HTNOTE_SCROLL", scrollY: data.scrollY } : null;
    default:
      return null;
  }
}

export function activateFrame(noteId: string, frame: Window) {
  const previous = frames.get(noteId);
  if (previous && previous !== frame) readyFrames.delete(previous);
  stagedFrames.delete(frame);
  frames.set(noteId, frame);
  const query = pendingHighlights.get(noteId);
  if (query && readyFrames.has(frame)) requestHighlight(noteId, query);
}

export function registerFrame(noteId: string, frame: Window, staged = false): () => void {
  if (staged) {
    stagedFrames.set(frame, noteId);
    return () => {
      stagedFrames.delete(frame);
      readyFrames.delete(frame);
      if (frames.get(noteId) === frame) frames.delete(noteId);
    };
  }
  const previous = frames.get(noteId);
  if (previous) readyFrames.delete(previous);
  frames.set(noteId, frame);
  return () => {
    if (frames.get(noteId) === frame) {
      frames.delete(noteId);
      readyFrames.delete(frame);
    }
  };
}

export function createRateLimiter(intervalMs: number): (frame: Window) => boolean {
  const lastOpen = new WeakMap<Window, number>();
  return (frame) => {
    const now = Date.now();
    const last = lastOpen.get(frame);
    if (last !== undefined && now - last < intervalMs) return false;
    lastOpen.set(frame, now);
    return true;
  };
}

function currentTheme() {
  const theme = useSettingsStore.getState().settings?.theme ?? "system";
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const mode = resolveThemeMode(theme, prefersDark);
  const vars = getNoteThemeVars(mode);
  const style = getComputedStyle(document.documentElement);
  for (const token of ["surface", "text", "muted", "border", "accent", "accent-text", "accent-hover", "hover", "danger"]) {
    const value = style.getPropertyValue(`--app-${token}`).trim();
    if (value) vars[`--ht-audio-${token}`] = value;
  }
  const audioLabels = Object.fromEntries((["play", "pause", "mute", "unmute", "seek", "title", "error"] as const).map((key) => [key, i18n.t(`audioPlayer.${key}`)]));
  const labels = Object.fromEntries((["copy", "copied", "copyFailed", "reset"] as const).map((key) => [key, i18n.t(`textBox.${key}`)]));
  return { type: "HTNOTE_THEME", vars, mode, audioLabels, labels: { ...labels, ipblockType: i18n.t("widgetTypes.ipblock"), ipblockCopyList: i18n.t("ipBlock.copyList"), ipblockGateway: i18n.t("ipBlock.gateway"), ipblockPrefix: i18n.t("ipBlock.prefix"), ipblockPlaceholder: i18n.t("ipBlock.placeholder"), ipblockInvalidIPv4: i18n.t("ipBlock.invalidIPv4"), ipblockInvalidPrefix: i18n.t("ipBlock.invalidPrefix"), ipblockGatewayBoundary: i18n.t("ipBlock.gatewayBoundary"), ipblockEmpty: i18n.t("ipBlock.empty"), ipblockSummary: i18n.t("ipBlock.summary", { block: "{{block}}", count: "{{count}}" }), locale: i18n.resolvedLanguage?.split("-")[0] === "en" ? "en" : "tr", calcType: i18n.t("widgetTypes.calc"), calcReset: i18n.t("calc.reset"), calcCopyTotal: i18n.t("calc.copyTotal"), calcTotal: i18n.t("calc.total"), calcContent: i18n.t("editor.calc.content"), calcError: i18n.t("calc.error"), calcLimit: i18n.t("calc.limit"), textboxType: i18n.t("widgetTypes.textbox"), checklistType: i18n.t("widgetTypes.checklist"), checklistReset: i18n.t("checklist.reset"), copyRemaining: i18n.t("checklist.copyRemaining"), checklistProgress: i18n.t("checklist.progress"), templateType: i18n.t("widgetTypes.template"), templateReset: i18n.t("template.reset"), templatePreview: i18n.t("template.preview"), copyfieldsType: i18n.t("widgetTypes.copyfields"), copyAll: i18n.t("copyFields.copyAll"), copyRow: i18n.t("copyFields.copyRow", { name: "{{name}}" }), copyfieldsRow: i18n.t("copyFields.row", { index: "{{index}}" }) } };
}

function sendTheme(frame: Window) {
  frame.postMessage(currentTheme(), getNoteOrigin());
}

export function sendThemeToAll() {
  for (const frame of new Set([...frames.values(), ...stagedFrames.keys()])) sendTheme(frame);
}

function sendContentWidth(frame: Window) {
  const contentWidth = useSettingsStore.getState().settings?.contentWidth;
  if (!contentWidth) return;
  frame.postMessage({ type: "HTNOTE_CONTENT_WIDTH", contentWidth }, getNoteOrigin());
}

export function sendContentWidthToAll() {
  for (const frame of new Set([...frames.values(), ...stagedFrames.keys()])) sendContentWidth(frame);
}

const allowExternalOpen = createRateLimiter(1000);

export function handleBridgeMessage(event: MessageEvent) {
  const entry = [...frames].find(([, candidate]) => candidate === event.source)
    ?? [...stagedFrames].map(([candidate, id]) => [id, candidate] as const).find(([, candidate]) => candidate === event.source);
  if (!entry) return;
  const [noteId, frame] = entry;
  const message = parseBridgeMessage(event, frame, getNoteOrigin());
  if (!message) return;
  switch (message.type) {
    case "HTNOTE_READY":
      readyFrames.add(frame);
      sendTheme(frame);
      sendContentWidth(frame);
      for (const [noteId, candidate] of frames) {
        if (candidate !== frame || !pendingHighlights.has(noteId)) continue;
        if (useTabsStore.getState().tabs.find((tab) => tab.noteId === noteId)?.doc.mode === "view") {
          frame.postMessage({ type: "HTNOTE_HIGHLIGHT", query: pendingHighlights.get(noteId) }, getNoteOrigin());
        }
        pendingHighlights.delete(noteId);
      }
      break;
    case "HTNOTE_OPEN_NOTE":
      if (useTreeStore.getState().findNoteById(message.id)) useTabsStore.getState().openNote(message.id);
      else useUiStore.getState().pushToast({ kind: "error", messageKey: "errors.NOTE_NOT_FOUND" });
      break;
    case "HTNOTE_OPEN_EXTERNAL":
      if (allowExternalOpen(frame)) void ipc.openExternalUrl(message.url).catch(() => {});
      break;
    case "HTNOTE_OPEN_ASSET":
      if (allowExternalOpen(frame)) void ipc.openNoteAsset(noteId, message.relPath).catch(notifyError);
      break;
    case "HTNOTE_SHORTCUT": {
      const shortcut = matchShortcut(message.input, getPlatform());
      if (shortcut) dispatchShortcut(shortcut);
      break;
    }
    case "HTNOTE_SCROLL":
      break;
  }
}

export function installBridgeHost(target: Window = window): () => void {
  target.addEventListener("message", handleBridgeMessage);
  i18n.on("languageChanged", sendThemeToAll);
  // React applies the root theme class after the settings store notification.
  const themeObserver = new MutationObserver(sendThemeToAll);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-reduced-motion"] });
  const unsubscribe = useSettingsStore.subscribe((state, previous) => {
    if (state.settings?.theme !== previous.settings?.theme) sendThemeToAll();
    if (state.settings?.contentWidth !== previous.settings?.contentWidth) sendContentWidthToAll();
  });
  const media = target.matchMedia?.("(prefers-color-scheme: dark)");
  const onSystemThemeChange = () => {
    if (useSettingsStore.getState().settings?.theme === "system") sendThemeToAll();
  };
  media?.addEventListener("change", onSystemThemeChange);
  return () => {
    target.removeEventListener("message", handleBridgeMessage);
    i18n.off("languageChanged", sendThemeToAll);
    themeObserver.disconnect();
    unsubscribe();
    media?.removeEventListener("change", onSystemThemeChange);
  };
}

export function resetBridgeHostForTests() {
  frames.clear();
  stagedFrames.clear();
  readyFrames.clear();
  pendingHighlights.clear();
}
