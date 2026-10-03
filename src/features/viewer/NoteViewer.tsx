import { useEffect, useRef, useState } from "react";
import { Download, Pencil, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { NoteEditor } from "@/features/editor/NoteEditor";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { useEditSession } from "@/features/editor/useEditSession";
import { toggleFavorite } from "@/features/favorites/favorites";
import { TagInput } from "@/features/tags/TagInput";
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

function NoteFrame({ id, active, editing, title, revision }: { id: string; active: boolean; editing: boolean; title: string; revision: string }) {
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
    <div className={`h-full w-full ${editing ? "absolute inset-0 invisible pointer-events-none" : "relative"} ${active && !editing ? "htnote-mode-transition" : ""}`} hidden={!active} inert={!active || editing} aria-hidden={!active || editing} data-mode="view">
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
  const [now, setNow] = useState(() => Date.now());
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number; trigger: HTMLElement } | null>(null);
  const exportBusy = useUiStore((state) => state.exportBusy);
  const activeNote = activeId ? findNote(tree, activeId) : null;
  const activeTab = tabs.find((tab) => tab.noteId === activeId);
  const tagSuggestions = deriveTags(tree);

  const mounted = cache.tabs === tabs && cache.activeId === activeId
    ? cache.mounted
    : nextMounted(cache.mounted, activeId, openIds);
  if (mounted !== cache.mounted) setCache({ tabs, activeId, mounted });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const saved = activeNote ? relativeSaved(activeNote.updatedAt, i18n.language, now) : "";
  return (
    <div className="flex h-full min-h-0 w-full flex-col text-left">
      {(activeNote || activeTab?.doc.removedOnDisk) && (
        <div className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-app-border bg-app-surface px-5 py-2">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{activeNote?.title ?? activeTab?.doc.removedTitle ?? t("tabs.untitled")}</h2>
            {saved && <p className="text-xs text-app-muted">{t("viewer.lastSaved", { time: saved })}</p>}
            {activeNote && <TagInput key={activeNote.id} tags={activeNote.tags} suggestions={tagSuggestions} onChange={(tags) => void setNoteTags(activeNote.id, tags)} />}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IconButton type="button" disabled={!activeNote} onClick={() => { if (activeNote) void toggleFavorite(activeNote.id, !activeNote.isFavorite); }} label={t("viewer.favorite")} aria-pressed={activeNote?.isFavorite ?? false} className={`rounded p-2 ${activeNote?.isFavorite ? "text-app-accent" : "text-app-muted"}`}><Star className="size-4" fill={activeNote?.isFavorite ? "currentColor" : "none"} aria-hidden /></IconButton>
            <IconButton type="button" disabled={!activeNote || exportBusy} label={exportBusy ? t("export.exporting") : t("viewer.export")} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setExportMenu({ x: rect.left, y: rect.bottom, trigger: event.currentTarget }); }} className="text-app-muted"><Download className="size-4" aria-hidden /></IconButton>
            {exportMenu && activeNote && <ContextMenu x={exportMenu.x} y={exportMenu.y} trigger={exportMenu.trigger} onClose={() => setExportMenu(null)} items={[
              { id: "pdf", label: t(pdfMode() === "print" ? "export.printPdf" : "export.pdf"), onSelect: () => void exportNote(activeNote.id, activeNote.title, "pdf") },
              { id: "html", label: t("export.html"), onSelect: () => void exportNote(activeNote.id, activeNote.title, "html") },
              { id: "zip", label: t("export.zip"), onSelect: () => void exportNote(activeNote.id, activeNote.title, "zip") },
            ]} />}
            {tabs.find((tab) => tab.noteId === activeId)?.doc.mode === "view" && <Button type="button" data-testid="edit-note" onClick={() => { void session.toggleEdit(); }} ><Pencil className="size-4" aria-hidden />{t("viewer.edit")}</Button>}
          </div>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {!activeId && <div className="flex h-full flex-col items-center justify-center gap-3 text-app-muted"><p>{t("viewer.empty")}</p></div>}
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
    </div>
  );
}
