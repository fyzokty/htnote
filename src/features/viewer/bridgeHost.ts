import { openUrl } from "@tauri-apps/plugin-opener";

import { getNoteOrigin } from "@/lib/noteUrl";
import { dispatchShortcut } from "@/lib/shortcuts/manager";
import { getPlatform, matchShortcut } from "@/lib/shortcuts/registry";
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
  | { type: "HTNOTE_SHORTCUT"; input: KeyInput }
  | { type: "HTNOTE_SCROLL"; scrollY: number };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const frames = new Map<string, Window>();

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

export function registerFrame(noteId: string, frame: Window): () => void {
  frames.set(noteId, frame);
  return () => {
    if (frames.get(noteId) === frame) frames.delete(noteId);
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
  return { type: "HTNOTE_THEME", vars: getNoteThemeVars(mode), mode };
}

function sendTheme(frame: Window) {
  frame.postMessage(currentTheme(), getNoteOrigin());
}

export function sendThemeToAll() {
  for (const frame of new Set(frames.values())) sendTheme(frame);
}

const allowExternalOpen = createRateLimiter(1000);

export function handleBridgeMessage(event: MessageEvent) {
  const frame = [...frames.values()].find((candidate) => candidate === event.source);
  if (!frame) return;
  const message = parseBridgeMessage(event, frame, getNoteOrigin());
  if (!message) return;
  switch (message.type) {
    case "HTNOTE_READY":
      sendTheme(frame);
      break;
    case "HTNOTE_OPEN_NOTE":
      if (useTreeStore.getState().findNoteById(message.id)) useTabsStore.getState().openNote(message.id);
      else useUiStore.getState().pushToast({ kind: "error", messageKey: "errors.NOTE_NOT_FOUND" });
      break;
    case "HTNOTE_OPEN_EXTERNAL":
      if (allowExternalOpen(frame)) void openUrl(message.url).catch(() => {});
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
  const unsubscribe = useSettingsStore.subscribe((state, previous) => {
    if (state.settings?.theme !== previous.settings?.theme) sendThemeToAll();
  });
  const media = target.matchMedia?.("(prefers-color-scheme: dark)");
  const onSystemThemeChange = () => {
    if (useSettingsStore.getState().settings?.theme === "system") sendThemeToAll();
  };
  media?.addEventListener("change", onSystemThemeChange);
  return () => {
    target.removeEventListener("message", handleBridgeMessage);
    unsubscribe();
    media?.removeEventListener("change", onSystemThemeChange);
  };
}

export function resetBridgeHostForTests() {
  frames.clear();
}
