import { describe, expect, it } from "vitest";

import { getNoteThemeVars, resolveThemeMode } from "@/lib/theme";

const keys = ["--ht-bg", "--ht-text", "--ht-accent", "--ht-font", "--ht-muted", "--ht-border", "--ht-code-bg"];

describe("getNoteThemeVars", () => {
  it("produces the complete palette for each mode", () => {
    const light = getNoteThemeVars("light");
    const dark = getNoteThemeVars("dark");

    expect(Object.keys(light)).toEqual(keys);
    expect(Object.keys(dark)).toEqual(keys);
    expect(light["--ht-bg"]).toBe("#f9fafb");
    expect(dark["--ht-bg"]).toBe("#0f172a");
    expect(light["--ht-text"]).not.toBe(dark["--ht-text"]);
    expect(light["--ht-font"]).toBe(dark["--ht-font"]);
  });
});

describe("resolveThemeMode", () => {
  it("uses the explicit mode or system preference", () => {
    expect(resolveThemeMode("system", false)).toBe("light");
    expect(resolveThemeMode("system", true)).toBe("dark");
    expect(resolveThemeMode("light", true)).toBe("light");
    expect(resolveThemeMode("dark", false)).toBe("dark");
  });
});
