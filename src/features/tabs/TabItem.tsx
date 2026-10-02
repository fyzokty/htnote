import type { MouseEvent, PointerEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useTranslation } from "react-i18next";

import { Tooltip } from "@/components/ui/Tooltip";
import { formatShortcut } from "@/lib/shortcuts/registry";
import { IconButton } from "@/components/ui/IconButton";
import { useTreeStore } from "@/stores/treeStore";

interface Props {
  noteId: string;
  active: boolean;
  isDirty?: boolean;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
}

export function TabItem({ noteId, active, isDirty = false, onActivate, onClose, onContextMenu }: Props) {
  const { t } = useTranslation();
  const title = useTreeStore((state) => state.findNoteById(noteId)?.title) ?? t("tabs.untitled");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: noteId });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 1 : undefined,
  };

  function stopDrag(event: PointerEvent<HTMLButtonElement>) { event.stopPropagation(); }

  return (
    <div
      ref={setNodeRef}
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
      className={`select-none group flex h-full w-44 shrink-0 cursor-pointer items-center gap-2 border-r border-app-border px-3 text-sm ${active ? "border-b-2 border-b-app-accent bg-app-bg text-app-text hover:bg-app-hover" : "bg-app-surface text-app-muted hover:bg-app-subtle"}`}
      style={style}
    >
      <Tooltip label={title} className="min-w-0 flex-1"><span className="truncate">{title}</span></Tooltip>
      <IconButton size="sm" shortcut={formatShortcut("closeTab")}
        type="button"
        label={t("tabs.closeTab", { title })}
        onPointerDown={stopDrag}
        onClick={(event) => { event.stopPropagation(); onClose(); }}
        className="size-5 min-h-0"
      >
        <span className={isDirty ? "group-hover:hidden group-focus-within:hidden" : "hidden"} aria-hidden>•</span>
        <span className={isDirty ? "hidden group-hover:inline group-focus-within:inline" : ""} aria-hidden>×</span>
      </IconButton>
    </div>
  );
}
