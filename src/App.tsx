import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/app/AppShell";
import { Toaster } from "@/components/ui/Toaster";
import { useMotionMode } from "@/hooks/useReducedMotion";
import { useThemeMode } from "@/hooks/useThemeMode";
import i18n from "@/i18n";
import { resolveLanguage, writeCachedLanguage } from "@/i18n/language";
import { hideSplash } from "@/lib/splash";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTreeStore } from "@/stores/treeStore";

function App() {
  const status = useSettingsStore((state) => state.status);
  const language = useSettingsStore((state) => state.settings?.language);
  const load = useSettingsStore((state) => state.load);
  const treeStatus = useTreeStore((state) => state.status);
  const { t } = useTranslation();
  useThemeMode();
  useMotionMode();

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  useEffect(() => {
    const resolved = resolveLanguage(language, navigator.language);
    void i18n.changeLanguage(resolved);
    writeCachedLanguage(resolved);
  }, [language]);

  // Rust ilk taramayı arka planda yapar; boş kabuk görünmesin diye açılış ekranı
  // ayarlar ve ilk not ağacı yüklenene (ya da hata oluşana) kadar kalır.
  useEffect(() => {
    if (status === "error" || (status === "ready" && treeStatus !== "idle")) hideSplash();
  }, [status, treeStatus]);

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
