import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { FilePlus2, FolderPlus, Menu, NotebookPen, Plus, Search, Settings2, Trash2 } from "lucide-react";

import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";

const clampWidth = (width: number) => Math.min(480, Math.max(200, width));

export function AppShell() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.update);
  const sidebarVisible = useUiStore((state) => state.sidebarVisible);
  const setSidebarVisible = useUiStore((state) => state.setSidebarVisible);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const sidebarWidth = dragWidth ?? clampWidth(settings?.sidebarWidth ?? 260);
  const widthRef = useRef(sidebarWidth);
  const draggingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const savedVisible = settings?.sidebarVisible;
  useEffect(() => {
    if (savedVisible !== undefined) setSidebarVisible(savedVisible);
  }, [savedVisible, setSidebarVisible]);

  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      void updateSettings({ sidebarWidth: widthRef.current }).catch(() => {});
    }
  }, [updateSettings]);

  function startResize(event: PointerEvent<HTMLDivElement>) {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    draggingRef.current = true;
    widthRef.current = sidebarWidth;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resize(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const left = event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
    const width = clampWidth(event.clientX - left);
    widthRef.current = width;
    setDragWidth(width);
  }

  function finishResize(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void updateSettings({ sidebarWidth: widthRef.current })
        .catch(() => {})
        .finally(() => setDragWidth(null));
    }, 150);
  }

  return (
    <main className="flex h-screen min-h-0 w-full overflow-hidden bg-gray-50 text-gray-900 dark:bg-slate-900 dark:text-slate-100">
      {sidebarVisible && (
        <aside
          className="relative flex h-full min-h-0 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800"
          style={{ width: sidebarWidth }}
          aria-label="Kenar çubuğu"
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 px-4 dark:border-slate-700">
            <NotebookPen className="size-5 text-indigo-600 dark:text-indigo-500" aria-hidden />
            <h1 className="text-lg font-semibold">HTNote</h1>
          </div>
          <div className="shrink-0 space-y-3 p-3">
            <div className="flex gap-1">
              <button type="button" disabled className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-indigo-600 px-2 py-2 text-xs font-medium text-white disabled:cursor-default dark:bg-indigo-500">
                <FilePlus2 className="size-4 shrink-0" aria-hidden /> + Not
              </button>
              <button type="button" disabled className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-gray-100 px-2 py-2 text-xs font-medium disabled:cursor-default dark:bg-slate-700">
                <FolderPlus className="size-4 shrink-0" aria-hidden /> + Klasör
              </button>
              <button type="button" disabled className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-gray-100 px-2 py-2 text-xs font-medium disabled:cursor-default dark:bg-slate-700">
                <Search className="size-4 shrink-0" aria-hidden /> Ara
              </button>
            </div>
            <input type="search" aria-label="Hızlı filtre" placeholder="Hızlı filtre..." className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-indigo-600 dark:border-slate-600 dark:bg-slate-900 dark:focus:border-indigo-500" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6 text-center text-sm text-gray-500 dark:text-slate-400">
            Henüz not veya klasör yok.
          </div>
          <div className="shrink-0 border-t border-gray-200 p-2 dark:border-slate-700">
            <button type="button" disabled className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm disabled:cursor-default">
              <Trash2 className="size-4" aria-hidden /> Çöp Kutusu
            </button>
            <button type="button" disabled className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm disabled:cursor-default">
              <Settings2 className="size-4" aria-hidden /> Ayarlar
            </button>
          </div>
          <div
            role="separator"
            aria-label="Kenar çubuğunu yeniden boyutlandır"
            aria-orientation="vertical"
            aria-valuemin={200}
            aria-valuemax={480}
            aria-valuenow={sidebarWidth}
            onPointerDown={startResize}
            onPointerMove={resize}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
            className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none hover:bg-indigo-600/30 dark:hover:bg-indigo-500/30"
          />
        </aside>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-800">
          <button type="button" onClick={toggleSidebar} aria-label={sidebarVisible ? "Kenar çubuğunu gizle" : "Kenar çubuğunu göster"} className="rounded-md p-2 text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-slate-300 dark:hover:bg-slate-700 dark:focus-visible:outline-indigo-500">
            <Menu className="size-5" aria-hidden />
          </button>
          <span className="text-sm text-gray-500 dark:text-slate-400">Sekmeler</span>
          <button type="button" disabled aria-label="Yeni sekme" className="ml-auto rounded-md p-2 text-gray-500 disabled:cursor-default dark:text-slate-400">
            <Plus className="size-4" aria-hidden />
          </button>
        </header>
        <section className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden p-6 text-center" aria-label="Çalışma alanı">
          <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-slate-400">
            <NotebookPen className="size-10 text-indigo-600 dark:text-indigo-500" aria-hidden />
            <p>Bir not seçin veya yeni not oluşturun</p>
          </div>
        </section>
      </div>
    </main>
  );
}
