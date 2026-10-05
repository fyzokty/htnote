import { describe, expect, it } from "vitest";

import { formatShortcut, listShortcuts, matchShortcut } from "@/lib/shortcuts/registry";
import type { KeyInput, Platform, ShortcutId } from "@/lib/shortcuts/registry";

const base: KeyInput = { key: "", ctrl: false, shift: false, alt: false, meta: false };

describe("matchShortcut", () => {
  it("D09 HTNOTE_SHORTCUT payload'ını code olmadan eşleştirir", () => {
    const payload: KeyInput = {
      key: "N",
      ctrl: true,
      shift: true,
      alt: false,
      meta: false,
    };

    expect(matchShortcut(payload, "windows")).toBe("newFolder");
    expect(matchShortcut({ ...payload, key: "\\", shift: false }, "windows")).toBe("toggleSidebar");
    expect(matchShortcut({ ...payload, ctrl: false, meta: true }, "mac")).toBe("newFolder");
  });

  it("matches settings from host and bridge on Windows and macOS", () => {
    expect(matchShortcut({ ...base, key: ",", code: "Comma", ctrl: true }, "windows")).toBe("openSettings");
    expect(matchShortcut({ ...base, key: ",", meta: true }, "mac")).toBe("openSettings");
    expect(matchShortcut({ ...base, key: ",", ctrl: true, shift: true }, "windows")).toBeNull();
    expect(formatShortcut("openSettings", "windows")).toBe("Ctrl+,");
    expect(formatShortcut("openSettings", "mac")).toBe("\u2318,");
  });

  it.each<{ name: string; platform: Platform; input: Partial<KeyInput>; expected: ShortcutId | null }>([
    { name: "Windows Ctrl+N", platform: "windows", input: { key: "n", code: "KeyN", ctrl: true }, expected: "newNote" },
    { name: "macOS Cmd+N", platform: "mac", input: { key: "n", code: "KeyN", meta: true }, expected: "newNote" },
    { name: "macOS Ctrl+N", platform: "mac", input: { key: "n", code: "KeyN", ctrl: true }, expected: null },
    { name: "Linux Ctrl+N", platform: "linux", input: { key: "n", code: "KeyN", ctrl: true }, expected: "newNote" },
    { name: "macOS Cmd+S", platform: "mac", input: { key: "s", code: "KeyS", meta: true }, expected: "save" },
    { name: "macOS Ctrl+S", platform: "mac", input: { key: "s", code: "KeyS", ctrl: true }, expected: null },
    { name: "Ctrl+Shift+N", platform: "windows", input: { key: "N", code: "KeyN", ctrl: true, shift: true }, expected: "newFolder" },
    { name: "Ctrl+Tab on macOS", platform: "mac", input: { key: "Tab", code: "Tab", ctrl: true }, expected: "nextTab" },
    { name: "Ctrl+Shift+Tab", platform: "windows", input: { key: "Tab", code: "Tab", ctrl: true, shift: true }, expected: "prevTab" },
    { name: "Ctrl+Shift+Tab on macOS", platform: "mac", input: { key: "Tab", code: "Tab", ctrl: true, shift: true }, expected: "prevTab" },
    { name: "Cmd+Tab stays with OS", platform: "mac", input: { key: "Tab", code: "Tab", meta: true }, expected: null },
    { name: "Backslash code with different key", platform: "windows", input: { key: "ş", code: "Backslash", ctrl: true }, expected: "toggleSidebar" },
    { name: "IntlBackslash code", platform: "windows", input: { key: "<", code: "IntlBackslash", ctrl: true }, expected: "toggleSidebar" },
    { name: "Bridge key without code", platform: "windows", input: { key: "\\", ctrl: true }, expected: "toggleSidebar" },
    { name: "AltGr does not trigger sidebar", platform: "windows", input: { key: "\\", code: "Backslash", ctrl: true, alt: true }, expected: null },
    { name: "macOS Cmd+Backslash", platform: "mac", input: { key: "\\", code: "Backslash", meta: true }, expected: "toggleSidebar" },
    { name: "Turkish Q sidebar alternative", platform: "windows", input: { key: "B", code: "KeyB", ctrl: true, shift: true }, expected: "toggleSidebar" },
    { name: "macOS sidebar alternative", platform: "mac", input: { key: "B", code: "KeyB", meta: true, shift: true }, expected: "toggleSidebar" },
    { name: "shortcut help", platform: "windows", input: { key: "/", code: "Slash", ctrl: true }, expected: "showShortcuts" },
    { name: "Turkish Q physical slash key produces period", platform: "windows", input: { key: ".", code: "Slash", ctrl: true }, expected: null },
    { name: "Turkish Q shifted slash key", platform: "windows", input: { key: "/", code: "Digit7", ctrl: true, shift: true }, expected: "showShortcuts" },
    { name: "numpad divide shortcut", platform: "windows", input: { key: "/", code: "NumpadDivide", ctrl: true }, expected: "showShortcuts" },
    { name: "bridge shifted slash payload", platform: "windows", input: { key: "/", ctrl: true, shift: true }, expected: "showShortcuts" },
    { name: "Ctrl+B remains in editor", platform: "windows", input: { key: "b", code: "KeyB", ctrl: true }, expected: null },
    { name: "Escape", platform: "linux", input: { key: "Escape", code: "Escape" }, expected: "escape" },
  ])("$name", ({ platform, input, expected }) => {
    expect(matchShortcut({ ...base, ...input }, platform)).toBe(expected);
  });
});

describe("formatShortcut", () => {
  it("registers the block movement keys without collisions", () => {
    const shortcuts = listShortcuts();
    for (const id of ["blockMoveUp", "blockMoveDown"] as const) {
      const shortcut = shortcuts.find((entry) => entry.id === id)!;
      expect(shortcut.bound).toBe(true);
      expect(shortcut.displayOnly).toBe(true);
      expect(shortcuts.filter((entry) => entry.key === shortcut.key && entry.modifier === shortcut.modifier && entry.shift === shortcut.shift && entry.alt === shortcut.alt)).toHaveLength(1);
    }
    expect(formatShortcut("blockMoveUp", "windows")).toBe("Alt+Shift+ArrowUp");
    expect(formatShortcut("blockMoveDown", "mac")).toBe("⌥⇧ArrowDown");
  });
  it("Windows ve macOS etiketlerini üretir", () => {
    expect(formatShortcut("newNote", "windows")).toBe("Ctrl+N");
    expect(formatShortcut("newFolder", "linux")).toBe("Ctrl+Shift+N");
    expect(formatShortcut("toggleSidebar", "windows")).toBe("Ctrl+\\ / Ctrl+Shift+B");
    expect(formatShortcut("newNote", "mac")).toBe("⌘N");
    expect(formatShortcut("globalSearch", "mac")).toBe("⌘⇧F");
    expect(formatShortcut("prevTab", "mac")).toBe("⌃⇧Tab");
    expect(formatShortcut("escape", "mac")).toBe("Escape");
    expect(formatShortcut("showShortcuts", "mac")).toBe("⌘/");
    expect(formatShortcut("toggleSidebar", "mac")).toBe("⌘\\ / ⌘⇧B");
  });
});
