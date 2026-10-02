import { useEffect, useRef, useState } from "react";
import { Download, Pencil, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

import { NoteEditor } from "@/features/editor/NoteEditor";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { useEditSession } from "@/features/editor/useEditSession";
import { toggleFavorite } from "@/features/favorites/favorites";
import { TagInput } from "@/features/tags/TagInput";
import { BacklinksPanel } from "@/features/viewer/BacklinksPanel";
import { deriveTags, setNoteTags } from "@/features/tags/tags";
import { nextMounted } from "@/features/viewer/lru";
import { canExportPdf, exportNote } from "@/features/viewer/exportNote";
import { registerFrame } from "@/features/viewer/bridgeHost";
import { NOTE_IFRAME_SANDBOX, noteUrl } from "@/lib/noteUrl";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import type { NoteNode, TreeNode } from "@/lib/types";
import { useTabsStore } from "@/stores/tabsStore";
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

function NoteFrame({ id, active, title }: { id: string; active: boolean; title: string }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const frame = frameRef.current?.contentWindow;
    return frame ? registerFrame(id, frame) : undefined;
  }, [id]);
  return (
    <div className="relative h-full w-full" hidden={!active}>
      {!loaded && <div role="progressbar" aria-label={t("viewer.loading")} className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-app-accent" />}
      <iframe
        ref={frameRef}
        title={title}
        src={noteUrl(id)}
        sandbox={NOTE_IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        className="h-full w-full border-0"
      />
    </div>
  );
}

export function NoteViewer() {
  const { t, i18n } = useTranslation();
  const tabs = useTabsStore((state) => state.tabs);
  const activeId = useTabsStore((state) => state.activeId);
  const session = useEditSession(activeId);
  useShortcut("toggleEdit", () => { void session.toggleEdit(); });
  useShortcut("save", () => { void session.save(true); });
  const tree = useTreeStore((state) => state.tree);
  const openIds = tabs.map((tab) => tab.noteId);
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
            <button type="button" disabled={!activeNote} onClick={() => { if (activeNote) void toggleFavorite(activeNote.id, !activeNote.isFavorite); }} aria-label={t("viewer.favorite")} title={t("viewer.favorite")} aria-pressed={activeNote?.isFavorite ?? false} className={`rounded p-2 ${activeNote?.isFavorite ? "text-app-accent" : "text-app-muted"}`}><Star className="size-4" fill={activeNote?.isFavorite ? "currentColor" : "none"} aria-hidden /></button>
            <button type="button" disabled={!activeNote || exportBusy} aria-label={exportBusy ? t("export.exporting") : t("viewer.export")} title={t("viewer.export")} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setExportMenu({ x: rect.left, y: rect.bottom, trigger: event.currentTarget }); }} className="flex items-center gap-1 rounded p-2 text-app-muted"><Download className="size-4" aria-hidden />{exportBusy && t("export.exporting")}</button>
            {exportMenu && activeNote && <ContextMenu x={exportMenu.x} y={exportMenu.y} trigger={exportMenu.trigger} onClose={() => setExportMenu(null)} items={[
              { id: "pdf", label: t("export.pdf"), disabled: !canExportPdf(), title: !canExportPdf() ? t("errors.UNSUPPORTED_PLATFORM") : undefined, onSelect: () => void exportNote(activeNote.id, activeNote.title, "pdf") },
              { id: "html", label: t("export.html"), onSelect: () => void exportNote(activeNote.id, activeNote.title, "html") },
              { id: "zip", label: t("export.zip"), onSelect: () => void exportNote(activeNote.id, activeNote.title, "zip") },
            ]} />}
            {tabs.find((tab) => tab.noteId === activeId)?.doc.mode === "view" && <button type="button" data-testid="edit-note" onClick={() => { void session.toggleEdit(); }} className="flex items-center gap-1 rounded bg-app-subtle px-3 py-2 text-sm text-app-muted"><Pencil className="size-4" aria-hidden />{t("viewer.edit")}</button>}
          </div>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {!activeId && <div className="flex h-full flex-col items-center justify-center gap-3 text-app-muted"><p>{t("viewer.empty")}</p></div>}
        {activeId && !activeNote && !activeTab?.doc.removedOnDisk && <div className="flex h-full items-center justify-center text-app-muted">{t("viewer.notFound")}</div>}
        {openIds.filter((id) => mounted.includes(id)).map((id) => {
          const note = findNote(tree, id);
          if (!note && !tabs.find((tab) => tab.noteId === id)?.doc.removedOnDisk) return null;
          const doc = tabs.find((tab) => tab.noteId === id)?.doc;
          return doc && doc.mode !== "view" && id === activeId
            ? <NoteEditor key={id} noteId={id} doc={doc} session={session} />
            : note ? <NoteFrame key={`${id}:${doc?.lastSavedAt ?? ""}:${doc?.baseVersion ?? 0}`} id={id} active={id === activeId} title={note.title} /> : null;
        })}
      </div>
      {activeId && activeNote && activeTab?.doc.mode === "view" && <BacklinksPanel id={activeId} saveRevision={tabs.map((tab) => tab.doc.lastSavedAt ?? "").join(":")} />}
    </div>
  );
}
