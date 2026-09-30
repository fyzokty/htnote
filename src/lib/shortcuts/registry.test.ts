import { describe, expect, it } from "vitest";

import { formatShortcut, matchShortcut } from "@/lib/shortcuts/registry";
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

  it.each<{ name: string; platform: Platform; input: Partial<KeyInput>; expected: ShortcutId | null }>([
    { name: "Windows Ctrl+N", platform: "windows", input: { key: "n", code: "KeyN", ctrl: true }, expected: "newNote" },
    { name: "macOS Cmd+N", platform: "mac", input: { key: "n", code: "KeyN", meta: true }, expected: "newNote" },
    { name: "macOS Ctrl+N", platform: "mac", input: { key: "n", code: "KeyN", ctrl: true }, expected: null },
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
    { name: "Ctrl+B remains in editor", platform: "windows", input: { key: "b", code: "KeyB", ctrl: true }, expected: null },
    { name: "Escape", platform: "linux", input: { key: "Escape", code: "Escape" }, expected: "escape" },
  ])("$name", ({ platform, input, expected }) => {
    expect(matchShortcut({ ...base, ...input }, platform)).toBe(expected);
  });
});

describe("formatShortcut", () => {
  it("Windows ve macOS etiketlerini üretir", () => {
    expect(formatShortcut("newNote", "windows")).toBe("Ctrl+N");
    expect(formatShortcut("newFolder", "linux")).toBe("Ctrl+Shift+N");
    expect(formatShortcut("toggleSidebar", "windows")).toBe("Ctrl+\\");
    expect(formatShortcut("newNote", "mac")).toBe("⌘N");
    expect(formatShortcut("globalSearch", "mac")).toBe("⌘⇧F");
    expect(formatShortcut("prevTab", "mac")).toBe("⌃⇧Tab");
    expect(formatShortcut("escape", "mac")).toBe("Escape");
  });
});
