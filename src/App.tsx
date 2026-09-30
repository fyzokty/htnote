import { useEffect } from "react";

import { AppShell } from "@/app/AppShell";
import { useSettingsStore } from "@/stores/settingsStore";

function App() {
  const status = useSettingsStore((state) => state.status);
  const load = useSettingsStore((state) => state.load);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  if (status !== "ready") {
    return (
      <main className="flex h-screen items-center justify-center bg-slate-900 text-slate-100">
        {status === "error" ? "Ayarlar yüklenemedi." : "Yükleniyor..."}
      </main>
    );
  }

  return <AppShell />;
}

export default App;
