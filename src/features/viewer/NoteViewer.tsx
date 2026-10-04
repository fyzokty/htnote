import { useReducedMotion } from "@/components/ui/useDialogPresence";
import { FileText } from "lucide-react";
import { useHeaderLayout } from "./useHeaderLayout";
import { NoteStatusBar } from "./NoteStatusBar";
import { formatShortcut } from "@/lib/shortcuts/registry";
import { NoteAppearancePicker } from "./NoteAppearancePicker";
import { useEffect, useRef, useState } from "react";
import { Clock3, Download, Pencil, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { EditSessionHeader, EditSessionStatus } from "@/features/editor/EditSessionHeader";
import { NoteEditor } from "@/features/editor/NoteEditor";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { useEditSession } from "@/features/editor/useEditSession";
import { toggleFavorite } from "@/features/favorites/favorites";
import { TagInput } from "@/features/tags/TagInput";
import { InlineRename } from "@/features/tree/InlineRename";
import { renameNoteItem } from "@/features/tree/useTreeActions";
import { BacklinksPanel } from "@/features/viewer/BacklinksPanel";
import { deriveTags, setNoteTags } from "@/features/tags/tags";
import { nextMounted } from "@/features/viewer/lru";
import { exportNote, pdfMode } from "@/features/viewer/exportNote";
import { registerFrame } from "@/features/viewer/bridgeHost";
import { NOTE_IFRAME_SANDBOX, noteUrl } from "@/lib/noteUrl";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import type { NoteNode, TreeNode } from "@/lib/types";
import { isSpecialTabId, useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

function findNote(nodes: TreeNode[], id: string): NoteNode | null {
  for (const node of nodes) {
    if (node.type === "note" && node.id === id) return node;
    if (node.type === "folder") {
      const found = findNote(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function relativeSaved(value: string, language: string, now: number): string {
  const elapsed = Date.parse(value) - now;
  if (!Number.isFinite(elapsed)) return "";
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  const minutes = Math.round(elapsed / 60_000);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(elapsed / 3_600_000);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(elapsed / 86_400_000), "day");
}

function NoteFrame({ id, active, editing, saving, title, revision }: { id: string; active: boolean; editing: boolean; saving: boolean; title: string; revision: string }) {
  const { t } = useTranslation();
  const [loadedRevision, setLoadedRevision] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const frame = frameRef.current?.contentWindow;
    return frame ? registerFrame(id, frame) : undefined;
  }, [id, revision]);
  return (
    // Keep layout while editing: navigating a display:none iframe can leave its
    // new document without layout in WebView2 even after it becomes visible.
    <div className={`h-full w-full ${editing ? "absolute inset-0 invisible pointer-events-none" : "relative"} ${active && !editing ? "htnote-mode-transition" : ""}`} hidden={!active} inert={!active || editing} aria-hidden={!active || editing} data-mode="view"
      data-note-id={id} data-revision={revision} data-loaded-revision={loadedRevision ?? ""} data-editing={editing} data-saving={saving}>
      {loadedRevision !== revision && <div role="progressbar" aria-label={t("viewer.loading")} className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-app-accent" />}
      <iframe
        ref={frameRef}
        title={title}
        src={`${noteUrl(id)}?revision=${encodeURIComponent(revision)}`}
        sandbox={NOTE_IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
        onLoad={() => setLoadedRevision(revision)}
        className="h-full w-full border-0"
      />
    </div>
  );
}

export function NoteViewer() {
  const { t, i18n } = useTranslation();
  const tabs = useTabsStore((state) => state.tabs);
  const activeId = useTabsStore((state) => state.activeId && !isSpecialTabId(state.activeId) ? state.activeId : null);
  const session = useEditSession(activeId);
  useShortcut("toggleEdit", () => { void session.toggleEdit(); });
  useShortcut("save", () => { void session.save(true); });
  const tree = useTreeStore((state) => state.tree);
  const openIds = tabs.filter((tab) => !tab.special).map((tab) => tab.noteId);
  const [cache, setCache] = useState(() => ({ tabs, activeId, mounted: nextMounted([], activeId, openIds) }));
  const reducedMotion = useReducedMotion();
  const [favoriteAnimation, setFavoriteAnimation] = useState<{ noteId: string; kind: "add" | "remove"; sequence: number } | null>(null);
  if (favoriteAnimation && favoriteAnimation.noteId !== activeId) setFavoriteAnimation(null);
  const [now, setNow] = useState(() => Date.now());
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number; trigger: HTMLElement } | null>(null);
  const exportBusy = useUiStore((state) => state.exportBusy);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const activeNote = activeId ? findNote(tree, activeId) : null;
  const isRenaming = Boolean(activeNote && renamingId === activeNote.id);
  const activeTab = tabs.find((tab) => tab.noteId === activeId);
  const editing = !!activeTab && activeTab.doc.mode !== "view";
  const tagSuggestions = deriveTags(tree);

  useShortcut("rename", () => {
    if (!activeNote || isRenaming) return;
    if (document.activeElement?.closest('[role="tree"]')) return;
    setRenamingId(activeNote.id);
  });

  const mounted = cache.tabs === tabs && cache.activeId === activeId
    ? cache.mounted
    : nextMounted(cache.mounted, activeId, openIds);
  if (mounted !== cache.mounted) setCache({ tabs, activeId, mounted });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const headerRef = useRef<HTMLDivElement>(null);
  const saved = activeNote ? relativeSaved(activeNote.updatedAt, i18n.language, now) : "";
  const headerLayout = useHeaderLayout(headerRef, `${activeNote?.id}:${activeNote?.title}:${activeNote?.relPath}:${activeNote?.tags.join(",")}:${saved}:${i18n.language}:${isRenaming}:${editing}:${activeTab?.doc.saving}:${activeTab?.doc.dirty}`, activeNote?.tags.length ?? 0);
  return (
    <div className="htnote-note-viewer flex h-full min-h-0 w-full flex-col text-left">
      {(activeNote || activeTab?.doc.removedOnDisk) && (
        <div data-testid="note-header" data-compact-level={headerLayout.compactLevel} className="htnote-note-header flex min-h-16 shrink-0 flex-nowrap items-center justify-between gap-2 border-b border-app-card-border bg-app-card px-4 py-2">
          <div ref={headerRef} data-header-content className="flex min-w-0 flex-1 items-center gap-2 overflow-visible whitespace-nowrap">
            {activeNote && activeNote.relPath.split(/[\\/]/).length > 1 && <span title={activeNote.relPath.split(/[\\/]/).slice(0, -1).join(" / ")} style={{ width: headerLayout.pathWidth }} className="htnote-note-path min-w-0 shrink-0 truncate text-xs text-app-muted"><span data-path-natural className="inline-block w-max">{activeNote.relPath.split(/[\\/]/).slice(0, -1).join(" / ")} /</span></span>}
            {isRenaming && activeNote ? (
              <InlineRename
                variant="underline"
                name={activeNote.title}
                label={t("viewer.renameLabel")}
                onConfirm={(name) => {
                  setRenamingId(null);
                  void renameNoteItem(activeNote.id, name);
                }}
                onCancel={() => setRenamingId(null)}
              />
            ) : activeNote ? (
              <Tooltip label={`${activeNote.title} — ${t("viewer.renameHint")}`} className="htnote-note-title min-w-0 shrink-0 truncate">
                <h2
                  tabIndex={0}
                  style={{ width: headerLayout.titleWidth }}
                  data-testid="note-title"
                  onDoubleClick={() => setRenamingId(activeNote.id)}
                  onKeyDown={(event) => {
                    if (event.key === "F2") {
                      event.preventDefault();
                      setRenamingId(activeNote.id);
                    }
                  }}
                  className="inline-block max-w-full cursor-text truncate font-semibold border-b-2 border-transparent py-0.5 outline-none hover:border-app-border focus-visible:ring-2 focus-visible:ring-app-accent rounded-sm"
                >
                  <span data-title-natural className="inline-block w-max">{activeNote.title}</span>
                </h2>
              </Tooltip>
            ) : (
              <h2 className="truncate font-semibold border-b-2 border-transparent py-0.5">{activeTab?.doc.removedTitle ?? t("tabs.untitled")}</h2>
            )}
            {saved && <span title={t("viewer.lastSaved", { time: saved })} style={{ width: headerLayout.savedWidth, position: headerLayout.savedWidth === 0 ? "absolute" : undefined, visibility: headerLayout.savedWidth === 0 ? "hidden" : undefined }} className="htnote-note-saved min-w-0 shrink-0 truncate text-xs text-app-muted"><span data-saved-natural className="inline-flex w-max items-center gap-1"><span>•</span><Clock3 className="size-3 shrink-0" aria-hidden /><span className="truncate">{t("viewer.lastSaved", { time: saved })}</span></span></span>}
            {editing && activeTab && <EditSessionStatus doc={activeTab.doc} />}
            {activeNote && <TagInput compact portalPanels visibleTagCount={headerLayout.visibleTags} key={activeNote.id} tags={activeNote.tags} suggestions={tagSuggestions} onChange={(tags) => void setNoteTags(activeNote.id, tags)} />}
          </div>
          <div data-header-actions className="flex shrink-0 items-center gap-1">
            {activeNote && <NoteAppearancePicker key={activeNote.id} noteId={activeNote.id} html={activeTab?.doc.draft?.html ?? activeTab?.doc.base?.html ?? ""} disabled={activeTab?.doc.saving || !!activeTab?.doc.externalConflict || activeTab?.doc.removedOnDisk} />}
            <IconButton type="button" disabled={!activeNote} onClick={() => {
              if (!activeNote) return;
              if (!reducedMotion) setFavoriteAnimation((previous) => ({ noteId: activeNote.id, kind: activeNote.isFavorite ? "remove" : "add", sequence: (previous?.sequence ?? 0) + 1 }));
              void toggleFavorite(activeNote.id, !activeNote.isFavorite);
            }} label={t("viewer.favorite")} aria-pressed={activeNote?.isFavorite ?? false} className={`rounded ${activeNote?.isFavorite ? "text-app-accent" : "text-app-muted"}`}><Star key={favoriteAnimation?.sequence ?? 0} className="size-4 htnote-favorite-star" data-animate={favoriteAnimation?.kind}
              onAnimationEnd={() => setFavoriteAnimation(null)} fill={activeNote?.isFavorite ? "currentColor" : "none"} aria-hidden /></IconButton>
            <Tooltip label={t("viewer.export")}><Button type="button" data-testid="export-note" disabled={!activeNote || exportBusy} aria-label={exportBusy ? t("export.exporting") : t("viewer.export")} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setExportMenu({ x: rect.left, y: rect.bottom, trigger: event.currentTarget }); }} className="text-app-muted"><Download className="size-4" aria-hidden /><span data-action-text data-action-priority="1">{t("viewer.export")}</span></Button></Tooltip>
            {exportMenu && activeNote && <ContextMenu x={exportMenu.x} y={exportMenu.y} trigger={exportMenu.trigger} onClose={() => setExportMenu(null)} items={[
              { id: "pdf", label: t(pdfMode() === "print" ? "export.printPdf" : "export.pdf"), onSelect: () => void exportNote(activeNote.id, activeNote.title, "pdf") },
              { id: "html", label: t("export.html"), onSelect: () => void exportNote(activeNote.id, activeNote.title, "html") },
              { id: "zip", label: t("export.zip"), onSelect: () => void exportNote(activeNote.id, activeNote.title, "zip") },
            ]} />}
            {tabs.find((tab) => tab.noteId === activeId)?.doc.mode === "view" && <Tooltip label={t("viewer.edit")} shortcut={formatShortcut("toggleEdit")}><Button type="button" variant="primary" data-testid="edit-note" aria-label={t("viewer.edit")} onClick={() => { void session.toggleEdit(); }} ><Pencil className="size-4" aria-hidden /><span data-action-text data-action-priority="5">{t("viewer.edit")}</span></Button></Tooltip>}
            {editing && activeTab && <EditSessionHeader doc={activeTab.doc} session={session} compact={headerLayout.compactLevel >= 3} />}
          </div>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {!activeId && <div className="htnote-empty-state h-full"><FileText aria-hidden /><p>{t("viewer.empty")}</p></div>}
        {activeId && !activeNote && !activeTab?.doc.removedOnDisk && <div className="flex h-full items-center justify-center text-app-muted">{t("viewer.notFound")}</div>}
        {/* Sabit DOM sırası iframe'lerin sekme sıralamasında taşınıp yeniden yüklenmesini önler. */}
        {openIds.filter((id) => mounted.includes(id)).sort().map((id) => {
          const note = findNote(tree, id);
          if (!note && !tabs.find((tab) => tab.noteId === id)?.doc.removedOnDisk) return null;
          const doc = tabs.find((tab) => tab.noteId === id)?.doc;
          const isEditing = doc && doc.mode !== "view" && id === activeId;
          return (
            <div key={id} className="contents">
              {note && (
                <NoteFrame
                  id={id}
                  active={id === activeId}
                  editing={Boolean(isEditing)}
                  saving={Boolean(doc?.saving)}
                  title={note.title}
                  revision={`${doc?.lastSavedAt ?? 0}:${doc?.baseVersion ?? 0}`}
                />
              )}
              {isEditing && (
                <div key={doc.mode} className="h-full w-full htnote-mode-transition" data-mode={doc.mode}>
                  <NoteEditor noteId={id} doc={doc} session={session} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {activeId && activeNote && activeTab?.doc.mode === "view" && <BacklinksPanel id={activeId} saveRevision={tabs.map((tab) => tab.doc.lastSavedAt ?? "").join(":")} />}
      {activeId && activeNote && activeTab && <NoteStatusBar key={activeId} id={activeId} doc={activeTab.doc} updatedAt={activeNote.updatedAt} />}
    </div>
  );
}
