import { COLOR_NAMES } from "@/lib/colors";
import type { Theme } from "@/lib/types";

export type ThemeMode = "light" | "dark";

const themeCacheKey = "htnote.themeMode";
const noteFont = "system-ui, -apple-system, sans-serif";

const noteColors: Record<ThemeMode, Record<string, string>> = {
  light: {
    "--ht-bg": "#ffffff",
    "--ht-text": "#111827",
    "--ht-accent": "#4f46e5",
    "--ht-font": noteFont,
    "--ht-muted": "#6b7280",
    "--ht-border": "#e5e7eb",
    "--ht-code-bg": "#f3f4f6",
  },
  dark: {
    "--ht-bg": "#1e293b",
    "--ht-text": "#f1f5f9",
    "--ht-accent": "#3b82f6",
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
  const vars = { ...noteColors[mode] };
  const style = getComputedStyle(document.documentElement);
  const currentMode = document.documentElement.classList.contains("dark") ? "dark" : "light";
  for (const [note, app] of [["bg", "surface"], ["text", "text"]]) {
    const current = mode === currentMode ? style.getPropertyValue(`--app-${app}`).trim() : "";
    const value = current || style.getPropertyValue(`--app-${app}-${mode}`).trim();
    if (value) vars[`--ht-${note}`] = value;
  }
  for (const name of COLOR_NAMES) {
    const value = style.getPropertyValue(`--app-color-${name}`).trim();
    if (value) vars[`--ht-color-${name}`] = value;
  }
  for (const token of ["scrollbar", "scrollbar-hover"]) {
    const value = style.getPropertyValue(`--app-${token}-${mode}`).trim();
    if (value) vars[`--ht-${token}`] = value;
  }
  vars["--ht-reduced-motion"] = document.documentElement.dataset.reducedMotion === "true" ? "1" : "0";
  vars["--ht-motion-duration"] = style.getPropertyValue("--htnote-mode-duration").trim() || "200ms";
  vars["--ht-motion-easing"] = style.getPropertyValue("--htnote-mode-easing").trim() || "cubic-bezier(0.16, 1, 0.3, 1)";
  return vars;
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
