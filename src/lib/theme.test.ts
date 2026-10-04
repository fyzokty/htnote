import { describe, expect, it } from "vitest";

import { getNoteThemeVars, resolveThemeMode } from "@/lib/theme";

const keys = ["--ht-bg", "--ht-text", "--ht-accent", "--ht-font", "--ht-muted", "--ht-border", "--ht-code-bg", "--ht-reduced-motion", "--ht-motion-duration", "--ht-motion-easing"];

describe("getNoteThemeVars", () => {
  it("takes the exact note surface and text from the requested app theme", () => {
    const root = document.documentElement;
    root.style.setProperty("--app-surface-dark", "#234567");
    root.style.setProperty("--app-text-dark", "#abcdef");
    try {
      expect(getNoteThemeVars("dark")).toMatchObject({ "--ht-bg": "#234567", "--ht-text": "#abcdef" });
    } finally {
      root.style.removeProperty("--app-surface-dark");
      root.style.removeProperty("--app-text-dark");
    }
  });

  it("reads the requested scrollbar palette from app tokens independently of the current theme", () => {
    const root = document.documentElement;
    for (const mode of ["light", "dark"] as const) {
      root.style.setProperty(`--app-scrollbar-${mode}`, mode === "light" ? "light-thumb" : "dark-thumb");
      root.style.setProperty(`--app-scrollbar-hover-${mode}`, `${mode}-hover`);
    }
    try {
      expect(getNoteThemeVars("light")["--ht-scrollbar"]).toBe("light-thumb");
      expect(getNoteThemeVars("dark")["--ht-scrollbar"]).toBe("dark-thumb");
      expect(getNoteThemeVars("dark")["--ht-scrollbar-hover"]).toBe("dark-hover");
    } finally {
      for (const mode of ["light", "dark"]) {
        root.style.removeProperty(`--app-scrollbar-${mode}`);
        root.style.removeProperty(`--app-scrollbar-hover-${mode}`);
      }
    }
  });

  it("produces the complete palette for each mode", () => {
    const light = getNoteThemeVars("light");
    const dark = getNoteThemeVars("dark");

    expect(Object.keys(light)).toEqual(keys);
    expect(Object.keys(dark)).toEqual(keys);
    expect(light["--ht-bg"]).toBe("#ffffff");
    expect(dark["--ht-bg"]).toBe("#1e293b");
    expect(dark["--ht-text"]).toBe("#f1f5f9");
    expect(dark["--ht-accent"]).toBe("#3b82f6");
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
