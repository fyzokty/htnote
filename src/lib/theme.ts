import type { Theme } from "@/lib/types";

export type ThemeMode = "light" | "dark";

const themeCacheKey = "htnote.themeMode";
const noteFont = "system-ui, -apple-system, sans-serif";

const noteColors: Record<ThemeMode, Record<string, string>> = {
  light: {
    "--ht-bg": "#f9fafb",
    "--ht-text": "#111827",
    "--ht-accent": "#4f46e5",
    "--ht-font": noteFont,
    "--ht-muted": "#6b7280",
    "--ht-border": "#e5e7eb",
    "--ht-code-bg": "#f3f4f6",
  },
  dark: {
    "--ht-bg": "#0f172a",
    "--ht-text": "#f1f5f9",
    "--ht-accent": "#6366f1",
    "--ht-font": noteFont,
    "--ht-muted": "#94a3b8",
    "--ht-border": "#334155",
    "--ht-code-bg": "#1e293b",
  },
};

export function resolveThemeMode(theme: Theme, prefersDark: boolean): ThemeMode {
  return theme === "system" ? (prefersDark ? "dark" : "light") : theme;
}

export function getNoteThemeVars(mode: ThemeMode): Record<string, string> {
  return { ...noteColors[mode] };
}

export function applyThemeClass(mode: ThemeMode): void {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function readCachedThemeMode(): ThemeMode | null {
  try {
    const mode = localStorage.getItem(themeCacheKey);
    return mode === "light" || mode === "dark" ? mode : null;
  } catch {
    return null;
  }
}

export function writeCachedThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(themeCacheKey, mode);
  } catch {
    // Depolama kapalıysa tema yine bu oturumda çalışır.
  }
}
