import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { FilePlus2, FolderPlus, Menu, NotebookPen, Search, Settings2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { installUnsavedWindowGuard } from "@/app/unsavedWindowGuard";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { RecoveryDialog } from "@/features/editor/RecoveryDialog";
import { installExternalChangeListener } from "@/features/editor/externalChange";
import type { RecoveryCandidate } from "@/features/editor/RecoveryDialog";
import { deleteRecoveryDraft, selectRecoveryCandidates, useDraftAutosave } from "@/features/editor/recoveryDrafts";
import { extractContent } from "@/features/editor/contentRegion";
import { getDropHandler, toCssPoint } from "@/features/editor/fileDrop";
import { setDiscardRecoveryDraftHook } from "@/features/editor/unsavedGuard";
import { SearchModal } from "@/features/search/SearchModal";
import { SidebarTree } from "@/features/tree/SidebarTree";
import { handleQuickFilterKeyDown } from "@/features/tree/filterTree";
import { TabBar } from "@/features/tabs/TabBar";
import { NoteViewer } from "@/features/viewer/NoteViewer";
import { installBridgeHost } from "@/features/viewer/bridgeHost";
import { startFsChangeSync } from "@/features/tree/fsChangeSync";
import { useTreeActions } from "@/features/tree/useTreeActions";
import { resolveLanguage } from "@/i18n/language";
import { ipc } from "@/lib/ipc";
import { onFileDrop } from "@/lib/events";
import { installShortcutListener } from "@/lib/shortcuts/manager";
import { formatShortcut } from "@/lib/shortcuts/registry";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

const clampWidth = (width: number) => Math.min(480, Math.max(200, width));

export function AppShell() {
  const { t } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.update);
  const loadTree = useTreeStore((state) => state.load);
  const filterQuery = useTreeStore((state) => state.filterQuery);
  const setFilterQuery = useTreeStore((state) => state.setFilterQuery);
  const openNote = useCallback((id: string) => useTabsStore.getState().openNote(id), []);
  const { createNote, createFolder } = useTreeActions(openNote);
  const setRenaming = useTreeStore((state) => state.setRenaming);
  const sidebarVisible = useUiStore((state) => state.sidebarVisible);
  const setSidebarVisible = useUiStore((state) => state.setSidebarVisible);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [recoveryCandidates, setRecoveryCandidates] = useState<RecoveryCandidate[]>([]);
  const unsavedDialog = useUiStore((state) => state.unsavedDialog);
  const searchOpen = useUiStore((state) => state.searchOpen);
  const openSearch = useUiStore((state) => state.openSearch);
  useDraftAutosave();
  const sidebarWidth = dragWidth ?? clampWidth(settings?.sidebarWidth ?? 260);
  const widthRef = useRef(sidebarWidth);
  const draggingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useShortcut("toggleSidebar", toggleSidebar);
  useShortcut("globalSearch", openSearch);
  useShortcut("newNote", () => { void createNote(); });
  useShortcut("newFolder", () => { void createFolder(); });
  useShortcut("rename", () => {
    const selected = useTreeStore.getState().selected;
    if (selected && document.activeElement?.closest('[role="tree"]')) {
      const node = selected.kind === "folder" ? selected.relPath : useTreeStore.getState().findNoteById(selected.id)?.relPath;
      if (node) setRenaming(node);
    }
  });
  useEffect(() => installShortcutListener(), []);
  useEffect(() => installBridgeHost(), []);
  useEffect(() => {
    const internals = (window as Window & { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: unknown; currentWebview?: unknown } } }).__TAURI_INTERNALS__;
    if (!internals?.metadata?.currentWindow || !internals.metadata.currentWebview) return;
    return installUnsavedWindowGuard();
  }, []);
  useEffect(() => startFsChangeSync(), []);
  useEffect(() => installExternalChangeListener(), []);
  useEffect(() => {
    const internals = (window as Window & { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: unknown } } }).__TAURI_INTERNALS__;
    if (!internals?.metadata?.currentWindow) return;
    let hovered: Element | null = null;
    let active = true;
    let eventVersion = 0;
    const clearHover = () => {
      hovered?.classList.remove("htnote-drop-target");
      hovered = null;
    };
    const listener = onFileDrop(async (event) => {
      const version = ++eventVersion;
      if (!active) return;
      if (event.type === "leave") { clearHover(); return; }
      if (!event.position) return;
      const scale = await getCurrentWindow().scaleFactor().catch(() => 1);
      if (!active || version !== eventVersion) return;
      const point = toCssPoint(event.position, scale);
      const hit = document.elementFromPoint(point.x, point.y);
      const visual = hit?.closest(".htnote-visual-editor .tiptap");
      const code = hit?.closest(".htnote-code-host");
      const tabs = useTabsStore.getState();
      const doc = tabs.tabs.find((tab) => tab.noteId === tabs.activeId)?.doc;
      const editor = doc?.mode === "visual" && visual ? "visual" : doc?.mode === "code" && code ? "code" : null;
      const handler = editor && tabs.activeId ? getDropHandler(tabs.activeId, editor) : undefined;
      const target = handler ? (visual ?? code ?? null) : null;
      if (hovered !== target) {
        clearHover();
        target?.classList.add("htnote-drop-target");
        hovered = target;
      }
      if (event.type === "drop") {
        clearHover();
        if (handler) void handler(event.paths, point);
        else useUiStore.getState().pushToast({ kind: "info", messageKey: "editor.dropInEditMode" });
      }
    });
    void listener.catch(() => {});
    return () => { active = false; clearHover(); void listener.then((unlisten) => unlisten(), () => {}); };
  }, []);
  useEffect(() => setDiscardRecoveryDraftHook(deleteRecoveryDraft), []);
  useEffect(() => {
    void loadTree().then(() => {
      useTabsStore.getState().restore(useTreeStore.getState().flatNotes().map((note) => note.id));
      void ipc.listDrafts().then(async (drafts) => {
        const { candidates, toDelete } = selectRecoveryCandidates(drafts, useTreeStore.getState().tree, Date.now());
        for (const id of toDelete) await deleteRecoveryDraft(id);
        const checked = await Promise.all(candidates.map(async ({ draft, note }) => {
          try {
            const disk = await ipc.readNote(draft.id);
            return { draft, note, diskChanged: draft.baseHash !== disk.contentHash };
          } catch (error) {
            console.warn("Could not check recovery draft", draft.id, error);
            return { draft, note };
          }
        }));
        setRecoveryCandidates(checked);
      }).catch((error: unknown) => console.warn("Could not list recovery drafts", error));
    }).catch(() => {});
  }, [loadTree]);
  useEffect(() => useTreeStore.subscribe((state, previous) => {
    if (state.tree !== previous.tree && useTabsStore.getState().restored) {
      useTabsStore.getState().replaceMissing(state.flatNotes().map((note) => note.id));
    }
  }), []);

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

  async function recoverDraft(id: string) {
    try {
      const draft = await ipc.readDraft(id);
      const base = await ipc.readNote(id);
      if (draft.baseHash !== base.contentHash && !recoveryCandidates.find((candidate) => candidate.draft.id === id)?.diskChanged) {
        setRecoveryCandidates((previous) => previous.map((candidate) => candidate.draft.id === id ? { ...candidate, diskChanged: true } : candidate));
        return;
      }
      const tabs = useTabsStore.getState();
      tabs.openNote(id);
      const current = useTabsStore.getState().tabs.find((tab) => tab.noteId === id)?.doc;
      if (current?.mode !== "view") return;
      tabs.enterEdit(id, base, "visual", extractContent(draft.html).ok);
      tabs.updateDraft(id, { html: draft.html, css: draft.css, js: draft.js });
      setRecoveryCandidates((previous) => previous.filter((candidate) => candidate.draft.id !== id));
    } catch (error) {
      console.warn("Could not recover draft", id, error);
    }
  }

  async function ignoreDraft(id: string) {
    await deleteRecoveryDraft(id);
    setRecoveryCandidates((previous) => previous.filter((candidate) => candidate.draft.id !== id));
  }

  return (
    <main className="flex h-screen min-h-0 w-full overflow-hidden bg-app-bg text-app-text">
      <UnsavedChangesDialog />
      {searchOpen && <SearchModal />}
      {!unsavedDialog && <RecoveryDialog candidates={recoveryCandidates} onRecover={(id) => void recoverDraft(id)} onIgnore={(id) => void ignoreDraft(id)} />}
      {sidebarVisible && (
        <aside
          className="relative flex h-full min-h-0 shrink-0 flex-col border-r border-app-border bg-app-surface"
          style={{ width: sidebarWidth }}
          aria-label={t("sidebar.label")}
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-app-border px-4">
            <NotebookPen className="size-5 text-app-accent" aria-hidden />
            <h1 className="text-lg font-semibold">{t("common.appName")}</h1>
          </div>
          <div className="shrink-0 space-y-3 p-3">
            <div className="flex gap-1">
              <button type="button" onClick={() => void createNote()} title={formatShortcut("newNote")} className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-app-accent px-2 py-2 text-xs font-medium text-app-accent-text">
                <FilePlus2 className="size-4 shrink-0" aria-hidden /> {t("sidebar.newNote")}
              </button>
              <button type="button" onClick={() => void createFolder()} title={formatShortcut("newFolder")} className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-app-subtle px-2 py-2 text-xs font-medium">
                <FolderPlus className="size-4 shrink-0" aria-hidden /> {t("sidebar.newFolder")}
              </button>
              <button type="button" onClick={openSearch} title={formatShortcut("globalSearch")} className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-app-subtle px-2 py-2 text-xs font-medium">
                <Search className="size-4 shrink-0" aria-hidden /> {t("sidebar.search")}
              </button>
            </div>
            <input type="search" aria-label={t("sidebar.quickFilter")} placeholder={t("sidebar.quickFilterPlaceholder")} value={filterQuery} onChange={(event) => setFilterQuery(event.target.value)} onKeyDown={(event) => handleQuickFilterKeyDown(event, () => setFilterQuery(""))} className="w-full rounded-md border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-accent" />
          </div>
          <SidebarTree onOpenNote={openNote} />
          <div className="shrink-0 border-t border-app-border p-2">
            <button type="button" disabled className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm disabled:cursor-default">
              <Trash2 className="size-4" aria-hidden /> {t("sidebar.trash")}
            </button>
            <button type="button" disabled className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm disabled:cursor-default">
              <Settings2 className="size-4" aria-hidden /> {t("sidebar.settings")}
            </button>
            <div className="mt-2 flex gap-1 border-t border-app-border pt-2" role="group" aria-label={t("settings.theme")}>
              {(["system", "light", "dark"] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  aria-pressed={settings?.theme === theme}
                  onClick={() => void updateSettings({ theme }).catch(() => {})}
                  className={`flex-1 rounded-md px-1 py-2 text-xs focus-visible:outline-2 focus-visible:outline-app-accent ${settings?.theme === theme ? "bg-app-accent text-app-accent-text" : "bg-app-subtle text-app-text hover:bg-app-border"}`}
                >
                  {t(`settings.${theme}`)}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-1" role="group" aria-label={t("settings.language")}>
              {(["tr", "en"] as const).map((language) => (
                <button
                  key={language}
                  type="button"
                  aria-pressed={resolveLanguage(settings?.language, navigator.language) === language}
                  onClick={() => void updateSettings({ language }).catch(() => {})}
                  className={`flex-1 rounded-md px-1 py-2 text-xs focus-visible:outline-2 focus-visible:outline-app-accent ${resolveLanguage(settings?.language, navigator.language) === language ? "bg-app-accent text-app-accent-text" : "bg-app-subtle text-app-text hover:bg-app-border"}`}
                >
                  {language === "tr" ? t("settings.turkish") : t("settings.english")}
                </button>
              ))}
            </div>
          </div>
          <div
            role="separator"
            aria-label={t("sidebar.resize")}
            aria-orientation="vertical"
            aria-valuemin={200}
            aria-valuemax={480}
            aria-valuenow={sidebarWidth}
            onPointerDown={startResize}
            onPointerMove={resize}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
            className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none hover:bg-app-accent/30"
          />
        </aside>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-app-border bg-app-surface px-3">
          <button type="button" onClick={toggleSidebar} title={formatShortcut("toggleSidebar")} aria-label={sidebarVisible ? t("sidebar.hide") : t("sidebar.show")} className="rounded-md p-2 text-app-muted hover:bg-app-subtle focus-visible:outline-2 focus-visible:outline-app-accent">
            <Menu className="size-5" aria-hidden />
          </button>
          <TabBar />
        </header>
        <section className="flex min-h-0 min-w-0 flex-1 overflow-hidden" aria-label={t("viewer.workspace")}>
          <NoteViewer />
        </section>
      </div>
    </main>
  );
}
