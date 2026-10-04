import { DialogPresence } from "@/components/ui/DialogPresence";
import { tagColor, tagColorStyle } from "@/features/tags/tagColors";
import { displayPath } from "@/lib/displayPath";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { FilePlus2, FolderPlus, NotebookPen, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { Tooltip } from "@/components/ui/Tooltip";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { installUnsavedWindowGuard } from "@/app/unsavedWindowGuard";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RecoveryDialog } from "@/features/editor/RecoveryDialog";
import { installExternalChangeListener } from "@/features/editor/externalChange";
import type { RecoveryCandidate } from "@/features/editor/RecoveryDialog";
import { deleteRecoveryDraft, selectRecoveryCandidates, useDraftAutosave } from "@/features/editor/recoveryDrafts";
import { extractContent } from "@/features/editor/contentRegion";
import { getDropHandler, toCssPoint, updateDropPreview } from "@/features/editor/fileDrop";
import { setDiscardRecoveryDraftHook } from "@/features/editor/unsavedGuard";
import { SearchModal } from "@/features/search/SearchModal";
import { SettingsView } from "@/features/settings/SettingsView";
import { ShortcutsModal } from "@/features/settings/ShortcutsModal";
import { TrashView } from "@/features/trash/TrashView";
import { refreshTrashCount } from "@/features/trash/deleteCoordinator";
import { SidebarFooter } from "@/features/tree/SidebarFooter";
import { SidebarTree } from "@/features/tree/SidebarTree";
import { FavoritesSection } from "@/features/favorites/FavoritesSection";
import { TagsSection } from "@/features/tags/TagsSection";
import { handleQuickFilterKeyDown } from "@/features/tree/filterTree";
import { TitleBar } from "@/features/titlebar/TitleBar";
import { NoteViewer } from "@/features/viewer/NoteViewer";
import { installBridgeHost } from "@/features/viewer/bridgeHost";
import { startFsChangeSync } from "@/features/tree/fsChangeSync";
import { useTreeActions } from "@/features/tree/useTreeActions";
import { ipc } from "@/lib/ipc";
import { onFileDrop } from "@/lib/events";
import { installShortcutListener, scheduleUnboundShortcutWarnings } from "@/lib/shortcuts/manager";
import { formatShortcut } from "@/lib/shortcuts/registry";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

const SIDEBAR_COMPACT_WIDTH = 200;
const clampWidth = (width: number) => Math.min(480, Math.max(SIDEBAR_COMPACT_WIDTH, width));

export function AppShell() {
  const { t } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.update);
  const loadTree = useTreeStore((state) => state.load);
  const filterQuery = useTreeStore((state) => state.filterQuery);
  const tagColors = useSettingsStore((state) => state.settings?.tagColors);
  const filterTag = useTreeStore((state) => state.filterTag);
  const setFilterTag = useTreeStore((state) => state.setFilterTag);
  const setFilterQuery = useTreeStore((state) => state.setFilterQuery);
  const openNote = useCallback((id: string) => {
    useTabsStore.getState().openNote(id);
  }, []);
  const { createNote, createFolder } = useTreeActions(openNote);
  const setRenaming = useTreeStore((state) => state.setRenaming);
  const sidebarVisible = useUiStore((state) => state.sidebarVisible);
  const setSidebarVisible = useUiStore((state) => state.setSidebarVisible);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [recoveryCandidates, setRecoveryCandidates] = useState<RecoveryCandidate[]>([]);
  const unsavedDialog = useUiStore((state) => state.unsavedDialog);
  const searchOpen = useUiStore((state) => state.searchOpen);
  const activeId = useTabsStore((state) => state.activeId);
  const trashOpen = activeId === "special:trash";
  const settingsOpen = activeId === "special:settings";
  const openSearch = useUiStore((state) => state.openSearch);
  useDraftAutosave();
  const sidebarWidth = dragWidth ?? clampWidth(settings?.sidebarWidth ?? 260);
  const widthRef = useRef(sidebarWidth);
  const draggingRef = useRef(false);
  const sidebarRef = useRef<HTMLElement | null>(null);

  const openShortcuts = () => {
    if (shortcutsOpen) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setShortcutsOpen(true);
  };
  const closeShortcuts = () => {
    setShortcutsOpen(false);
  };
  useEffect(() => {
    if (!shortcutsOpen && previousFocus.current) {
      previousFocus.current.focus();
      previousFocus.current = null;
    }
  }, [shortcutsOpen]);

  useShortcut("showShortcuts", openShortcuts);
  useShortcut("toggleSidebar", toggleSidebar);
  useShortcut("globalSearch", openSearch);
  useShortcut("openSettings", () => useTabsStore.getState().openSpecial("settings"));
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
  useEffect(() => scheduleUnboundShortcutWarnings(), []);
  useEffect(() => installBridgeHost(), []);
  useEffect(() => {
    const internals = (window as Window & { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: unknown; currentWebview?: unknown } } }).__TAURI_INTERNALS__;
    if (!internals?.metadata?.currentWindow || !internals.metadata.currentWebview) return;
    return installUnsavedWindowGuard();
  }, []);
  useEffect(() => startFsChangeSync(), []);
  useEffect(() => { void refreshTrashCount().catch(() => {}); }, []);
  useEffect(() => installExternalChangeListener(), []);
  useEffect(() => {
    const internals = (window as Window & { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: unknown } } }).__TAURI_INTERNALS__;
    if (!internals?.metadata?.currentWindow) return;
    let hovered: Element | null = null;
    let active = true;
    let eventVersion = 0;
    const clearHover = () => {
      updateDropPreview(null, null);
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
        if (editor === "code") target?.classList.add("htnote-drop-target");
        hovered = target;
      }
      updateDropPreview(editor === "visual" && handler ? tabs.activeId : null, event.type === "drop" ? null : point);
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

  const finishResize = useCallback((event?: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsResizing(false);
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        void 0;
      }
    }
    const finalWidth = widthRef.current;
    setDragWidth(null);
    void updateSettings({ sidebarWidth: finalWidth }).catch(() => {});
  }, [updateSettings]);

  useEffect(() => {
    if (!isResizing) return;
    const onBlur = () => finishResize();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [isResizing, finishResize]);

  function compactSidebar() {
    draggingRef.current = false;
    setIsResizing(false);
    widthRef.current = SIDEBAR_COMPACT_WIDTH;
    setDragWidth(null);
    void updateSettings({ sidebarWidth: SIDEBAR_COMPACT_WIDTH }).catch(() => {});
  }

  function startResize(event: PointerEvent<HTMLDivElement>) {
    // İkinci basış sürükleme başlatmaz; sonraki pointerup kompakt değeri ezemez.
    if (event.detail >= 2) {
      compactSidebar();
      return;
    }
    draggingRef.current = true;
    setIsResizing(true);
    widthRef.current = sidebarWidth;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function resize(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
    const width = clampWidth(event.clientX - left);
    widthRef.current = width;
    setDragWidth(width);
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
    <div className="htnote-app flex h-screen min-h-0 w-full flex-col overflow-hidden bg-app-bg text-app-text">
      <TitleBar />
      <main className="htnote-shell select-none flex min-h-0 w-full flex-1 overflow-hidden">
        {isResizing && (
          <div
            className="fixed inset-0 z-50 cursor-col-resize select-none"
            onPointerMove={resize}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
          />
        )}
        <UnsavedChangesDialog />
        <ConfirmDialog />
        <DialogPresence>{searchOpen && <SearchModal />}</DialogPresence>
        <DialogPresence>{shortcutsOpen && <ShortcutsModal onClose={closeShortcuts} />}</DialogPresence>
        <DialogPresence>{!unsavedDialog && <RecoveryDialog candidates={recoveryCandidates} onRecover={(id) => void recoverDraft(id)} onIgnore={(id) => void ignoreDraft(id)} />}</DialogPresence>
        {sidebarVisible && (
          <aside
            ref={sidebarRef}
            className="htnote-sidebar-card relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden"
            style={{ width: sidebarWidth }}
            aria-label={t("sidebar.label")}
          >
            <div className="flex shrink-0 items-center gap-3 px-4 pt-5 pb-2">
              <span className="rounded-xl bg-app-primary p-2 text-app-accent-text"><NotebookPen className="size-5" aria-hidden /></span>
              <div className="min-w-0"><h1 className="select-none text-lg font-semibold">{t("common.appName")}</h1>{settings?.rootDir && <p title={displayPath(settings.rootDir)} className="truncate text-xs text-app-muted">{displayPath(settings.rootDir).replace(/[\\/]+$/, "").split(/[\\/]/).pop()}</p>}</div>
            </div>
            <div className="shrink-0 space-y-3 p-3">
              <div className="htnote-sidebar-actions grid grid-cols-[minmax(56px,0.7fr)_minmax(0,1.3fr)] gap-2">
                <Tooltip label={t("sidebar.newNote")} shortcut={formatShortcut("newNote")} className="col-span-2"><Button type="button" data-testid="new-note" onClick={() => void createNote()} variant="primary" size="sm" className="w-full min-w-0 justify-start px-3">
                  <FilePlus2 className="size-4 shrink-0" aria-hidden /> {t("sidebar.newNote")}<kbd className="htnote-shortcut-badge ml-auto">{formatShortcut("newNote")}</kbd>
                </Button></Tooltip>
                <Tooltip label={t("sidebar.newFolder")} shortcut={formatShortcut("newFolder")} className="min-w-0"><Button type="button" data-testid="new-folder" onClick={() => void createFolder()} size="sm" className="w-full min-w-0 px-2 text-xs">
                  <FolderPlus className="size-4 shrink-0" aria-hidden /> {t("sidebar.folderAction")}
                </Button></Tooltip>
                <Tooltip label={t("sidebar.search")} shortcut={formatShortcut("globalSearch")} className="min-w-0"><Button type="button" data-testid="global-search" onClick={openSearch} size="sm" className="w-full min-w-0 px-2 text-xs">
                  <Search className="size-4 shrink-0" aria-hidden /> {t("sidebar.search")}<kbd className="htnote-shortcut-badge ml-auto">{formatShortcut("globalSearch")}</kbd>
                </Button></Tooltip>
              </div>
              <div className="flex items-center gap-1">
                <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-app-muted" aria-hidden />
                <input type="search" aria-label={t("sidebar.quickFilter")} placeholder={t("sidebar.quickFilterPlaceholder")} value={filterQuery} onChange={(event) => setFilterQuery(event.target.value)} onKeyDown={(event) => handleQuickFilterKeyDown(event, () => setFilterQuery(""))} className="min-w-0 flex-1 rounded-md border border-app-border bg-app-bg w-full pl-7 pr-7 py-1.5 text-xs outline-none focus:border-app-accent" />
                {filterQuery && <IconButton size="sm" label={t("sidebar.clearFilter")} className="absolute right-1 top-1/2 -translate-y-1/2 size-5" onClick={() => setFilterQuery("")}><X className="size-3" aria-hidden /></IconButton>}
                </div>
                {filterTag && <Button style={tagColorStyle(tagColor(tagColors, filterTag))} type="button" onClick={() => setFilterTag(null)} aria-label={t("tags.clearFilter", { tag: filterTag })} className={`max-w-24 shrink-0 truncate rounded bg-app-subtle px-2 py-1 text-xs ${tagColor(tagColors, filterTag) ? "htnote-colored-tag" : ""}`}>{filterTag} ×</Button>}
              </div>
            </div>
            <div className="htnote-sidebar-sections flex min-h-0 flex-1 flex-col">
              <FavoritesSection onOpenNote={openNote} />
              <SidebarTree onOpenNote={openNote} />
              <TagsSection />
            </div>
            <SidebarFooter />
            <div
              role="separator"
              aria-label={t("sidebar.resize")}
              aria-orientation="vertical"
              aria-valuemin={200}
              aria-valuemax={480}
              aria-valuenow={sidebarWidth}
              onPointerDown={startResize}
              onDoubleClick={compactSidebar}
              onPointerMove={resize}
              onPointerUp={finishResize}
              onPointerCancel={finishResize}
              className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none hover:bg-app-accent/30"
            />
          </aside>
        )}
        <section className="htnote-workspace-card flex min-h-0 min-w-0 flex-1 overflow-hidden" aria-label={t("viewer.workspace")}>
          {settingsOpen && <SettingsView onShowShortcuts={openShortcuts} />}
          {trashOpen && <TrashView />}
          <div hidden={settingsOpen || trashOpen} className="h-full min-h-0 w-full"><NoteViewer /></div>
        </section>
      </main>
    </div>
  );
}
