import { useLayoutEffect, useSyncExternalStore } from "react";

import { applyThemeClass, readCachedThemeMode, resolveThemeMode, writeCachedThemeMode } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";
import { useSettingsStore } from "@/stores/settingsStore";

const darkQuery = "(prefers-color-scheme: dark)";

function getSystemPreference(): boolean {
  return window.matchMedia?.(darkQuery).matches ?? false;
}

function subscribeToSystemPreference(onChange: () => void): () => void {
  const media = window.matchMedia?.(darkQuery);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}

function noSubscription(): () => void {
  return () => {};
}

export function useThemeMode(): ThemeMode {
  const theme = useSettingsStore((state) => state.settings?.theme);
  const prefersDark = useSyncExternalStore(
    theme === "system" ? subscribeToSystemPreference : noSubscription,
    getSystemPreference,
  );
  const mode = theme ? resolveThemeMode(theme, prefersDark) : readCachedThemeMode() ?? (prefersDark ? "dark" : "light");

  useLayoutEffect(() => {
    applyThemeClass(mode);
    if (theme) writeCachedThemeMode(mode);
  }, [mode, theme]);

  return mode;
}
