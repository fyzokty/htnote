import { useEffect } from "react";
import { NotebookPen } from "lucide-react";

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

  return (
    <main className="flex h-screen items-center justify-center bg-slate-900 text-slate-100">
      <div className="flex items-center gap-3">
        <NotebookPen className="size-8 text-indigo-500" aria-hidden />
        <h1 className="text-3xl font-semibold tracking-tight">HTNote</h1>
      </div>
    </main>
  );
}

export default App;
