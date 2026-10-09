import { getPlatform } from "@/lib/platform";
import { allowShortcutInEditable, listShortcuts, matchShortcut, setShortcutBound } from "@/lib/shortcuts/registry";
import type { KeyInput, ShortcutId } from "@/lib/shortcuts/registry";

type Handler = () => void;

const subscribers = new Map<ShortcutId, Set<Handler>>();

export function subscribeShortcut(id: ShortcutId, handler: Handler): () => void {
  const handlers = subscribers.get(id) ?? new Set<Handler>();
  handlers.add(handler);
  subscribers.set(id, handlers);
  setShortcutBound(id, true);
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) {
      subscribers.delete(id);
      setShortcutBound(id, false);
    }
  };
}

export function scheduleUnboundShortcutWarnings(): () => void {
  if (!import.meta.env.DEV) return () => {};
  const timer = setTimeout(() => {
    for (const shortcut of listShortcuts()) {
      if (!shortcut.bound) console.warn(`Unbound shortcut: ${shortcut.id}`);
    }
  }, 3000);
  return () => clearTimeout(timer);
}

export function dispatchShortcut(id: ShortcutId): boolean {
  const handlers = subscribers.get(id);
  if (!handlers?.size) return false;
  for (const handler of [...handlers]) handler();
  return true;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
}

export function installShortcutListener(target: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const input: KeyInput = {
      key: event.key,
      code: event.code,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
    };
    const id = matchShortcut(input, getPlatform());
    if (!id || (isEditable(event.target) && !allowShortcutInEditable(id))) return;
    if (!subscribers.get(id)?.size) return;
    event.preventDefault();
    event.stopPropagation();
    dispatchShortcut(id);
  };
  target.addEventListener("keydown", onKeyDown, true);
  return () => target.removeEventListener("keydown", onKeyDown, true);
}
