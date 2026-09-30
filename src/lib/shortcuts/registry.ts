export type ShortcutId =
  | "newNote"
  | "newFolder"
  | "save"
  | "toggleEdit"
  | "globalSearch"
  | "closeTab"
  | "nextTab"
  | "prevTab"
  | "toggleSidebar"
  | "escape";

export type Platform = "mac" | "windows" | "linux";

export interface KeyInput {
  key: string;
  code?: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

type ShortcutDefinition = {
  codes: readonly string[];
  key: string;
  modifier: "mod" | "ctrl" | "none";
  shift: boolean;
};

const SHORTCUTS: Record<ShortcutId, ShortcutDefinition> = {
  newNote: { codes: ["KeyN"], key: "N", modifier: "mod", shift: false },
  newFolder: { codes: ["KeyN"], key: "N", modifier: "mod", shift: true },
  save: { codes: ["KeyS"], key: "S", modifier: "mod", shift: false },
  toggleEdit: { codes: ["KeyE"], key: "E", modifier: "mod", shift: false },
  globalSearch: { codes: ["KeyF"], key: "F", modifier: "mod", shift: true },
  closeTab: { codes: ["KeyW"], key: "W", modifier: "mod", shift: false },
  nextTab: { codes: ["Tab"], key: "Tab", modifier: "ctrl", shift: false },
  prevTab: { codes: ["Tab"], key: "Tab", modifier: "ctrl", shift: true },
  toggleSidebar: { codes: ["Backslash", "IntlBackslash"], key: "\\", modifier: "mod", shift: false },
  escape: { codes: ["Escape"], key: "Escape", modifier: "none", shift: false },
};

export function getPlatform(): Platform {
  if (typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)) return "mac";
  if (typeof navigator !== "undefined" && /Linux/i.test(navigator.platform)) return "linux";
  return "windows";
}

export function matchShortcut(input: KeyInput, platform: Platform): ShortcutId | null {
  for (const id of Object.keys(SHORTCUTS) as ShortcutId[]) {
    const shortcut = SHORTCUTS[id];
    // Bridge payload'ında code yoktur; yalnızca bu durumda key'e dönülür.
    const matchesKey = input.code
      ? shortcut.codes.includes(input.code)
      : input.key.toLowerCase() === shortcut.key.toLowerCase();
    if (!matchesKey || input.shift !== shortcut.shift || input.alt) continue;

    if (shortcut.modifier === "none" && !input.ctrl && !input.meta) return id;
    if (shortcut.modifier === "ctrl" && input.ctrl && !input.meta) return id;
    if (shortcut.modifier === "mod" && (platform === "mac"
      ? input.meta && !input.ctrl
      : input.ctrl && !input.meta)) return id;
  }
  return null;
}

export function formatShortcut(id: ShortcutId, platform: Platform = getPlatform()): string {
  const shortcut = SHORTCUTS[id];
  if (platform === "mac") {
    const modifier = shortcut.modifier === "mod" ? "⌘" : shortcut.modifier === "ctrl" ? "⌃" : "";
    return `${modifier}${shortcut.shift ? "⇧" : ""}${shortcut.key}`;
  }
  const modifier = shortcut.modifier === "none" ? "" : "Ctrl+";
  return `${modifier}${shortcut.shift ? "Shift+" : ""}${shortcut.key}`;
}
