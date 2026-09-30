import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/app/AppShell";
import { useThemeMode } from "@/hooks/useThemeMode";
import i18n from "@/i18n";
import { resolveLanguage } from "@/i18n/language";
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
    void i18n.changeLanguage(resolveLanguage(language, navigator.language));
  }, [language]);

  if (status !== "ready") {
    return (
      <main className="flex h-screen items-center justify-center bg-app-bg text-app-text">
        {status === "error" ? t("errors.settingsLoad") : t("common.loading")}
      </main>
    );
  }

  return <AppShell />;
}

export default App;
