import { tagColor, tagColorStyle } from "@/features/tags/tagColors";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { FilePlus2, FolderPlus, Menu, NotebookPen, Search, Settings2, Trash2 } from "lucide-react";
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
import { SidebarTree } from "@/features/tree/SidebarTree";
import { FavoritesSection } from "@/features/favorites/FavoritesSection";
import { TagsSection } from "@/features/tags/TagsSection";
import { handleQuickFilterKeyDown } from "@/features/tree/filterTree";
import { TabBar } from "@/features/tabs/TabBar";
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

const clampWidth = (width: number) => Math.min(480, Math.max(200, width));

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
  const trashCount = useUiStore((state) => state.trashCount);
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

  function startResize(event: PointerEvent<HTMLDivElement>) {
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
    <main className="htnote-shell select-none flex h-screen min-h-0 w-full overflow-hidden bg-app-bg text-app-text">
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
      {searchOpen && <SearchModal />}
      {shortcutsOpen && <ShortcutsModal onClose={closeShortcuts} />}
      {!unsavedDialog && <RecoveryDialog candidates={recoveryCandidates} onRecover={(id) => void recoverDraft(id)} onIgnore={(id) => void ignoreDraft(id)} />}
      {sidebarVisible && (
        <aside
          ref={sidebarRef}
          className="htnote-sidebar-card relative flex h-full min-h-0 shrink-0 flex-col"
          style={{ width: sidebarWidth }}
          aria-label={t("sidebar.label")}
        >
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-app-border px-4">
            <NotebookPen className="size-5 text-app-accent" aria-hidden />
            <h1 className="select-none text-lg font-semibold">{t("common.appName")}</h1>
          </div>
          <div className="shrink-0 space-y-3 p-3">
            <div className="flex gap-1">
              <Tooltip label={t("sidebar.newNote")} shortcut={formatShortcut("newNote")} className="flex-1"><Button type="button" data-testid="new-note" onClick={() => void createNote()} variant="primary" size="sm" className="min-w-0 flex-1 px-2 text-xs">
                <FilePlus2 className="size-4 shrink-0" aria-hidden /> {t("sidebar.newNote")}
              </Button></Tooltip>
              <Tooltip label={t("sidebar.newFolder")} shortcut={formatShortcut("newFolder")} className="flex-1"><Button type="button" data-testid="new-folder" onClick={() => void createFolder()} size="sm" className="min-w-0 flex-1 px-2 text-xs">
                <FolderPlus className="size-4 shrink-0" aria-hidden /> {t("sidebar.newFolder")}
              </Button></Tooltip>
              <Tooltip label={t("sidebar.search")} shortcut={formatShortcut("globalSearch")} className="flex-1"><Button type="button" data-testid="global-search" onClick={openSearch} size="sm" className="min-w-0 flex-1 px-2 text-xs">
                <Search className="size-4 shrink-0" aria-hidden /> {t("sidebar.search")}
              </Button></Tooltip>
            </div>
            <div className="flex items-center gap-1">
              <input type="search" aria-label={t("sidebar.quickFilter")} placeholder={t("sidebar.quickFilterPlaceholder")} value={filterQuery} onChange={(event) => setFilterQuery(event.target.value)} onKeyDown={(event) => handleQuickFilterKeyDown(event, () => setFilterQuery(""))} className="min-w-0 flex-1 rounded-md border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-app-accent" />
              {filterTag && <Button style={tagColorStyle(tagColor(tagColors, filterTag))} type="button" onClick={() => setFilterTag(null)} aria-label={t("tags.clearFilter", { tag: filterTag })} className={`max-w-24 shrink-0 truncate rounded bg-app-subtle px-2 py-1 text-xs ${tagColor(tagColors, filterTag) ? "htnote-colored-tag" : ""}`}>{filterTag} ×</Button>}
            </div>
          </div>
          <FavoritesSection onOpenNote={openNote} />
          <SidebarTree onOpenNote={openNote} />
          <TagsSection />
          <div className="shrink-0 border-t border-app-border p-2">
            <Button type="button" data-testid="trash" onClick={() => useTabsStore.getState().toggleSpecial("trash")} aria-pressed={trashOpen} variant="ghost" className="w-full justify-start gap-3">
              <Trash2 className="size-4" aria-hidden /> {t("sidebar.trash")} <span className="ml-auto">{trashCount}</span>
            </Button>
            <Button type="button" data-testid="settings" onClick={() => useTabsStore.getState().toggleSpecial("settings")} aria-pressed={settingsOpen} variant="ghost" className="w-full justify-start gap-3">
              <Settings2 className="size-4" aria-hidden /> {t("sidebar.settings")}
            </Button>
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
        <header className="htnote-shell-tabs flex h-10 shrink-0 items-center gap-3 border-b border-app-border bg-app-surface px-3">
          <IconButton type="button" onClick={toggleSidebar} shortcut={formatShortcut("toggleSidebar")} label={sidebarVisible ? t("sidebar.hide") : t("sidebar.show")} className="text-app-muted">
            <Menu className="size-5" aria-hidden />
          </IconButton>
          <TabBar />
        </header>
        <section className="htnote-workspace-card flex min-h-0 min-w-0 flex-1 overflow-hidden" aria-label={t("viewer.workspace")}>
          {settingsOpen && <SettingsView onShowShortcuts={openShortcuts} />}
          {trashOpen && <TrashView />}
          <div hidden={settingsOpen || trashOpen} className="h-full min-h-0 w-full"><NoteViewer /></div>
        </section>
      </div>
    </main>
  );
}
