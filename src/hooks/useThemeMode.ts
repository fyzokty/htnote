import { useEffect, useState } from "react";

import { applyThemeClass, readCachedThemeMode, resolveThemeMode, writeCachedThemeMode } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";
import { useSettingsStore } from "@/stores/settingsStore";

const darkQuery = "(prefers-color-scheme: dark)";

export function useThemeMode(): ThemeMode {
  const theme = useSettingsStore((state) => state.settings?.theme);
  const [mode, setMode] = useState<ThemeMode>(() => readCachedThemeMode() ?? "light");

  useEffect(() => {
    if (!theme) return;

    const media = window.matchMedia?.(darkQuery);
    const sync = () => {
      const nextMode = resolveThemeMode(theme, media?.matches ?? false);
      applyThemeClass(nextMode);
      writeCachedThemeMode(nextMode);
      setMode(nextMode);
    };

    sync();
    if (theme === "system") media?.addEventListener("change", sync);
    return () => {
      if (theme === "system") media?.removeEventListener("change", sync);
    };
  }, [theme]);

  return mode;
}
