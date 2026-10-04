import type { Platform } from "@/lib/platform";
import { getPlatform } from "@/lib/platform";

export type { Platform };

export type ShortcutId =
  | "openSettings"
  | "newNote"
  | "newFolder"
  | "rename"
  | "save"
  | "toggleEdit"
  | "globalSearch"
  | "closeTab"
  | "nextTab"
  | "prevTab"
  | "toggleSidebar"
  | "escape"
  | "showShortcuts"
  | "editorBold"
  | "editorItalic"
  | "editorUnderline"
  | "editorLink"
  | "editorUndo"
  | "editorRedo"
  | "editorStrike"
  | "formatDocument";

export type ShortcutCategory = "general" | "tabs" | "editing" | "editor";

export interface KeyInput {
  key: string;
  code?: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

type Binding = {
  codes: readonly string[];
  key: string;
  modifier: "mod" | "ctrl" | "none";
  shift: boolean;
  alt?: boolean;
};

type ShortcutDefinition = Binding & {
  allowInEditable?: boolean;
  category: ShortcutCategory;
  displayOnly?: boolean;
  alternatives?: readonly Binding[];
  bound: boolean;
};

const SHORTCUTS: Record<ShortcutId, ShortcutDefinition> = {
  openSettings: { codes: ["Comma"], key: ",", modifier: "mod", shift: false, allowInEditable: true, category: "general", bound: false },
  newNote: { codes: ["KeyN"], key: "N", modifier: "mod", shift: false, allowInEditable: true, category: "general", bound: false },
  newFolder: { codes: ["KeyN"], key: "N", modifier: "mod", shift: true, allowInEditable: true, category: "general", bound: false },
  rename: { codes: ["F2"], key: "F2", modifier: "none", shift: false, category: "editing", bound: false },
  save: { codes: ["KeyS"], key: "S", modifier: "mod", shift: false, category: "editing", bound: false },
  toggleEdit: { codes: ["KeyE"], key: "E", modifier: "mod", shift: false, category: "editing", bound: false },
  globalSearch: { codes: ["KeyF"], key: "F", modifier: "mod", shift: true, category: "general", bound: false },
  closeTab: { codes: ["KeyW"], key: "W", modifier: "mod", shift: false, category: "tabs", bound: false },
  nextTab: { codes: ["Tab"], key: "Tab", modifier: "ctrl", shift: false, category: "tabs", bound: false },
  prevTab: { codes: ["Tab"], key: "Tab", modifier: "ctrl", shift: true, category: "tabs", bound: false },
  toggleSidebar: { codes: ["Backslash", "IntlBackslash"], key: "\\", modifier: "mod", shift: false, allowInEditable: true, category: "general", bound: false, alternatives: [{ codes: ["KeyB"], key: "B", modifier: "mod", shift: true }] },
  escape: { codes: ["Escape"], key: "Escape", modifier: "none", shift: false, category: "general", displayOnly: true, bound: true },
  showShortcuts: { codes: ["Slash", "NumpadDivide"], key: "/", modifier: "mod", shift: false, allowInEditable: true, category: "general", bound: false },
  editorBold: { codes: ["KeyB"], key: "B", modifier: "mod", shift: false, category: "editor", displayOnly: true, bound: true },
  editorItalic: { codes: ["KeyI"], key: "I", modifier: "mod", shift: false, category: "editor", displayOnly: true, bound: true },
  editorUnderline: { codes: ["KeyU"], key: "U", modifier: "mod", shift: false, category: "editor", displayOnly: true, bound: true },
  editorUndo: { codes: ["KeyZ"], key: "Z", modifier: "mod", shift: false, category: "editor", displayOnly: true, bound: true },
  editorRedo: { codes: ["KeyZ"], key: "Z", modifier: "mod", shift: true, category: "editor", displayOnly: true, bound: true },
  editorStrike: { codes: ["KeyS"], key: "S", modifier: "mod", shift: true, category: "editor", displayOnly: true, bound: true },
  formatDocument: { codes: ["KeyF"], key: "F", modifier: "none", shift: true, alt: true, category: "editor", displayOnly: true, bound: true },
  editorLink: { codes: ["KeyK"], key: "K", modifier: "mod", shift: false, category: "editor", displayOnly: true, bound: true },
};

export function listShortcuts(): readonly (ShortcutDefinition & { id: ShortcutId })[] {
  return (Object.keys(SHORTCUTS) as ShortcutId[]).map((id) => ({ id, ...SHORTCUTS[id] }));
}

export function setShortcutBound(id: ShortcutId, bound: boolean): void {
  SHORTCUTS[id].bound = bound;
}

export function allowShortcutInEditable(id: ShortcutId): boolean {
  return SHORTCUTS[id].allowInEditable === true || (id !== "rename" && id !== "escape");
}

export function matchShortcut(input: KeyInput, platform: Platform): ShortcutId | null {
  for (const id of Object.keys(SHORTCUTS) as ShortcutId[]) {
    const shortcut = SHORTCUTS[id];
    if (shortcut.displayOnly && id !== "escape") continue;
    for (const binding of [shortcut, ...(shortcut.alternatives ?? [])]) {
      // Bridge payload'ında code yoktur; yalnızca bu durumda key'e dönülür.
      const matchesCode = input.code !== undefined && binding.codes.includes(input.code);
      const matchesProducedKey = input.key.toLowerCase() === binding.key.toLowerCase();
      const matchesKey = binding.key === "/"
        ? matchesProducedKey
        : matchesCode || matchesProducedKey;
      const shiftMatches = matchesProducedKey && binding.key === "/"
        ? true
        : input.shift === binding.shift;
      if (!matchesKey || !shiftMatches || input.alt !== (binding.alt ?? false)) continue;

      if (binding.modifier === "none" && !input.ctrl && !input.meta) return id;
      if (binding.modifier === "ctrl" && input.ctrl && !input.meta) return id;
      if (binding.modifier === "mod" && (platform === "mac"
        ? input.meta && !input.ctrl
        : input.ctrl && !input.meta)) return id;
    }
  }
  return null;
}

export function formatShortcut(id: ShortcutId, platform: Platform = getPlatform()): string {
  const shortcut = SHORTCUTS[id];
  return [shortcut, ...(shortcut.alternatives ?? [])].map((binding) => formatBinding(binding, platform)).join(" / ");
}

function formatBinding(shortcut: Binding, platform: Platform): string {
  if (platform === "mac") {
    const modifier = shortcut.modifier === "mod" ? "⌘" : shortcut.modifier === "ctrl" ? "⌃" : "";
    return `${modifier}${shortcut.alt ? "⌥" : ""}${shortcut.shift ? "⇧" : ""}${shortcut.key}`;
  }
  const modifier = shortcut.modifier === "none" ? "" : "Ctrl+";
  return `${modifier}${shortcut.alt ? "Alt+" : ""}${shortcut.shift ? "Shift+" : ""}${shortcut.key}`;
}
