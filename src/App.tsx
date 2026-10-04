import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/app/AppShell";
import { Toaster } from "@/components/ui/Toaster";
import { useThemeMode } from "@/hooks/useThemeMode";
import i18n from "@/i18n";
import { resolveLanguage, writeCachedLanguage } from "@/i18n/language";
import { hideSplash } from "@/lib/splash";
import { useSettingsStore } from "@/stores/settingsStore";

function App() {
  const status = useSettingsStore((state) => state.status);
  const language = useSettingsStore((state) => state.settings?.language);
  const load = useSettingsStore((state) => state.load);
  const { t } = useTranslation();
  useThemeMode();

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  useEffect(() => {
    const resolved = resolveLanguage(language, navigator.language);
    void i18n.changeLanguage(resolved);
    writeCachedLanguage(resolved);
  }, [language]);

  useEffect(() => {
    if (status === "ready" || status === "error") hideSplash();
  }, [status]);

  if (status === "idle" || status === "loading") return null;

  return (
    <>
      {status !== "ready" ? (
        <main className="flex h-screen items-center justify-center bg-app-bg text-app-text">
          {t("errors.settingsLoad")}
        </main>
      ) : <AppShell />}
      <Toaster />
    </>
  );
}

export default App;
