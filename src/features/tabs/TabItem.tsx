import type { MouseEvent, PointerEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { Settings2, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Tooltip } from "@/components/ui/Tooltip";
import { formatShortcut } from "@/lib/shortcuts/registry";
import { IconButton } from "@/components/ui/IconButton";
import type { SpecialTabKind } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";

interface Props {
  noteId: string;
  active: boolean;
  special?: SpecialTabKind;
  sizing?: "fixed" | "fit";
  isDirty?: boolean;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
}

export function TabItem({ noteId, active, special, sizing = "fixed", isDirty = false, onActivate, onClose, onContextMenu }: Props) {
  const { t } = useTranslation();
  const noteTitle = useTreeStore((state) => state.findNoteById(noteId)?.title);
  const title = special ? t(`sidebar.${special}`) : noteTitle ?? t("tabs.untitled");
  const SpecialIcon = special === "settings" ? Settings2 : Trash2;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: noteId, transition: { duration: 150, easing: "ease-out" } });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, 0px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : 0,
    boxShadow: isDragging ? "0 0 12px var(--app-shadow)" : undefined,
  };

  function stopDrag(event: PointerEvent<HTMLButtonElement>) { event.stopPropagation(); }

  return (
    <div
      ref={setNodeRef}
      data-note-id={noteId}
      data-dragging={isDragging || undefined}
      data-sizing={sizing}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={active}
      aria-label={title}
      tabIndex={active ? 0 : -1}
      onClick={onActivate}
      onMouseDown={(event) => { if (event.button === 1) event.preventDefault(); }}
      onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); onClose(); } }}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActivate(); } }}
      className={`htnote-tab relative select-none group flex h-full ${sizing === "fixed" ? "w-40" : "w-max min-w-28 max-w-64"} shrink-0 cursor-pointer touch-none items-center gap-2 border-r border-app-border px-3 text-sm ${active ? "border-b-2 border-b-app-accent bg-app-bg text-app-text hover:bg-app-hover" : "bg-app-surface text-app-muted hover:bg-app-subtle"}`}
      style={style}
    >
      {special && <SpecialIcon className="size-4 shrink-0 text-app-muted" aria-hidden />}
      <Tooltip label={title} className="min-w-0 flex-1"><span className="block truncate">{title}</span></Tooltip>
      <IconButton size="sm" shortcut={formatShortcut("closeTab")}
        type="button"
        label={t("tabs.closeTab", { title })}
        onPointerDown={stopDrag}
        onClick={(event) => { event.stopPropagation(); onClose(); }}
        className="htnote-tab-close"
      >
        <span data-testid="tab-dirty" className={`${isDirty ? "group-hover:hidden group-focus-within:hidden" : "hidden"} size-4 items-center justify-center ${isDirty ? "inline-flex" : ""}`} aria-hidden><span className="size-2 rounded-full bg-current" /></span>
        <X className={`size-4 ${isDirty ? "hidden group-hover:block group-focus-within:block" : ""}`} aria-hidden />
      </IconButton>
    </div>
  );
}
