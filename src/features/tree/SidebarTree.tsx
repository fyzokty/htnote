import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { DndContext, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContextMenu } from "@/components/ui/ContextMenu";
import { toggleFavorite } from "@/features/favorites/favorites";
import type { ContextMenuItem } from "@/components/ui/ContextMenu";
import { filterTree, matchRange } from "@/features/tree/filterTree";
import { InlineRename } from "@/features/tree/InlineRename";
import { MoveDialog } from "@/features/tree/MoveDialog";
import { deleteTreeItem } from "@/features/trash/deleteCoordinator";
import { canDrop } from "@/features/tree/canDrop";
import { preferTreeRow } from "@/features/tree/preferTreeRow";
import { useHoverExpand } from "@/features/tree/useHoverExpand";
import { nextVisibleNode, visibleNodes } from "@/features/tree/treeNavigation";
import { useTreeActions } from "@/features/tree/useTreeActions";
import { canExportPdf, exportNote } from "@/features/viewer/exportNote";
import { formatShortcut } from "@/lib/shortcuts/registry";
import type { TreeKey } from "@/features/tree/treeNavigation";
import type { TreeNode, TreeSelection } from "@/lib/types";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

interface RowProps {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  selected: boolean;
  tabbable: boolean;
  onSelect: (node: TreeNode) => void;
  onMenu: (node: TreeNode, x: number, y: number, trigger: HTMLElement) => void;
  renaming: boolean;
  onRename: (node: TreeNode, name: string) => void;
  onCancelRename: () => void;
  dragSource: TreeNode | null;
  dropPath: string | null;
  dropValid: boolean;
  filterQuery: string;
}

const treeCollisionDetection: CollisionDetection = (args) => preferTreeRow(pointerWithin(args));

const TreeRow = memo(function TreeRow({ node, depth, expanded, selected, tabbable, onSelect, onMenu, renaming, onRename, onCancelRename, dragSource, dropPath, dropValid, filterQuery }: RowProps) {
  const { t } = useTranslation();
  const isFolder = node.type === "folder";
  const drag = useDraggable({ id: `drag:${node.relPath}`, data: { node }, disabled: renaming });
  const drop = useDroppable({ id: `drop:${node.type}:${node.relPath}`, data: { path: node.relPath, type: node.type } });
  const setNodeRef = (element: HTMLElement | null) => { drag.setNodeRef(element); drop.setNodeRef(element); };
  const isTarget = dropPath === node.relPath && dragSource !== null;
  const label = isFolder ? node.name : node.title;
  const range = filterQuery ? matchRange(label, filterQuery) : null;
  return (
    <div
      ref={setNodeRef}
      onPointerDown={(event) => drag.listeners?.onPointerDown?.(event)}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={isFolder ? expanded : undefined}
      aria-selected={selected}
      aria-label={isFolder ? t("tree.folder", { name: node.name }) : t("tree.note", { name: node.title })}
      tabIndex={tabbable ? 0 : -1}
      data-tree-key={isFolder ? `folder:${node.relPath}` : `note:${node.id}`}
      onClick={(event) => { event.currentTarget.focus(); onSelect(node); }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onMenu(node, event.clientX, event.clientY, event.currentTarget); }}
      onKeyDown={(event) => {
        if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
          event.preventDefault(); event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          onMenu(node, rect.left, rect.bottom, event.currentTarget);
        }
      }}
      className={`flex min-w-0 cursor-pointer items-center gap-1 rounded-md py-1 pr-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-app-accent ${drag.isDragging ? "opacity-50" : ""} ${isTarget ? (dropValid ? "ring-2 ring-app-accent" : "ring-2 ring-red-500 cursor-not-allowed") : ""} ${selected ? "bg-app-accent text-app-accent-text" : "text-app-text hover:bg-app-subtle"}`}
      style={{ paddingLeft: depth * 16 + 4 }}
    >
      {isFolder ? (expanded ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />) : <span className="size-4 shrink-0" />}
      {isFolder ? <Folder className="size-4 shrink-0" aria-hidden /> : <FileText className="size-4 shrink-0" aria-hidden />}
      {renaming ? <InlineRename name={label} label={t("tree.rename")} onConfirm={(name) => onRename(node, name)} onCancel={onCancelRename} /> : <span className="truncate">{range ? <>{label.slice(0, range[0])}<mark className="bg-app-accent/30 text-inherit">{label.slice(range[0], range[1])}</mark>{label.slice(range[1])}</> : label}</span>}
    </div>
  );
});

function isSelected(node: TreeNode, selected: TreeSelection | null) {
  return node.type === "folder"
    ? selected?.kind === "folder" && selected.relPath === node.relPath
    : selected?.kind === "note" && selected.id === node.id;
}

export function SidebarTree({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const { t } = useTranslation();
  const tree = useTreeStore((state) => state.tree);
  const expanded = useTreeStore((state) => state.expanded);
  const filterQuery = useTreeStore((state) => state.filterQuery);
  const filterTag = useTreeStore((state) => state.filterTag);
  const filterExpandedOverride = useTreeStore((state) => state.filterExpandedOverride);
  const selected = useTreeStore((state) => state.selected);
  const exportBusy = useUiStore((state) => state.exportBusy);
  const select = useTreeStore((state) => state.select);
  const toggle = useTreeStore((state) => state.toggle);
  const renamingRelPath = useTreeStore((state) => state.renamingRelPath);
  const setRenaming = useTreeStore((state) => state.setRenaming);
  const { createNote, createFolder, renameNode, revealNode, moveNode } = useTreeActions(onOpenNote);
  const [menu, setMenu] = useState<{ node: TreeNode; x: number; y: number; trigger: HTMLElement } | null>(null);
  const [moveSource, setMoveSource] = useState<TreeNode | null>(null);
  const [dragSource, setDragSource] = useState<TreeNode | null>(null);
  const [dropPath, setDropPath] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const rootDrop = useDroppable({ id: "drop:root", data: { path: "", type: "root" } });
  const { hover, clear } = useHoverExpand(toggle);
  const rootRef = useRef<HTMLDivElement>(null);
  const setRootRef = (element: HTMLDivElement | null) => { rootRef.current = element; rootDrop.setNodeRef(element); };
  const pendingFocusKey = useRef<string | null>(null);
  const filtered = useMemo(() => filterTree(tree, filterQuery, { tag: filterTag ?? undefined }), [tree, filterQuery, filterTag]);
  const visibleTree = filtered.tree;
  const effectiveExpanded = useMemo(() => {
    if (!filterQuery.trim() && !filterTag) return expanded;
    const paths = new Set([...expanded, ...filtered.autoExpanded]);
    for (const path of filterExpandedOverride) {
      if (paths.has(path)) paths.delete(path);
      else paths.add(path);
    }
    return paths;
  }, [expanded, filtered, filterExpandedOverride, filterQuery, filterTag]);
  const rows = visibleNodes(visibleTree, effectiveExpanded);
  const selectedVisible = rows.some(({ node }) => isSelected(node, selected));
  const dropValid = dragSource !== null && dropPath !== null && canDrop(dragSource, dropPath, tree);

  useEffect(() => {
    const path = dropPath;
    hover(path, !!path && !!dragSource && canDrop(dragSource, path, tree) && !effectiveExpanded.has(path), () => {
      const current = useTreeStore.getState();
      const open = current.expanded.has(path ?? "") || filterTree(current.tree, current.filterQuery, { tag: current.filterTag ?? undefined }).autoExpanded.has(path ?? "");
      return !!dragSource && !!path && canDrop(dragSource, path, current.tree) && (current.filterExpandedOverride.has(path) ? open : !open);
    });
    return clear;
  }, [clear, dragSource, dropPath, effectiveExpanded, hover, tree]);

  function dragOver(event: DragOverEvent) {
    const target = event.over?.data.current;
    const path = (target?.type === "folder" || target?.type === "root") && typeof target.path === "string" ? target.path : null;
    setDropPath(path);
  }
  function finishDrag(event?: DragEndEvent) {
    clear();
    setDropPath(null);
    setDragSource(null);
    if (event) {
      const source = event.active.data.current?.node as TreeNode | undefined;
      const target = event.over?.data.current;
      if (source && (target?.type === "folder" || target?.type === "root") && typeof target.path === "string" && canDrop(source, target.path, useTreeStore.getState().tree)) void moveNode(source, target.path);
    }
  }

  useLayoutEffect(() => {
    const key = pendingFocusKey.current;
    if (!key) return;
    pendingFocusKey.current = null;
    const element = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-tree-key]") ?? [])
      .find((item) => item.dataset.treeKey === key);
    element?.focus();
  });

  const choose = useCallback((node: TreeNode) => {
    if (node.type === "folder") {
      pendingFocusKey.current = `folder:${node.relPath}`;
      select({ kind: "folder", relPath: node.relPath });
      toggle(node.relPath);
    } else {
      select({ kind: "note", id: node.id });
      onOpenNote(node.id);
    }
  }, [select, toggle, onOpenNote]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("input, [role=menu]")) return;
    const keys: TreeKey[] = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    if (event.key !== "Enter" && event.key !== "Delete" && !keys.includes(event.key as TreeKey)) return;
    event.preventDefault();
    const focusedKey = (event.target as HTMLElement).closest<HTMLElement>("[data-tree-key]")?.dataset.treeKey;
    const current = rows.find(({ node }) => focusedKey === (node.type === "folder" ? `folder:${node.relPath}` : `note:${node.id}`))?.node
      ?? rows.find(({ node }) => isSelected(node, selected))?.node ?? null;
    if (event.key === "Delete") {
      if (current) void deleteTreeItem(current);
      return;
    }
    if (event.key === "Enter") {
      if (current) {
        choose(current);
      }
      return;
    }
    const next = event.target === rootRef.current && rows.length && (event.key === "ArrowUp" || event.key === "ArrowDown")
      ? { node: rows[event.key === "ArrowUp" ? rows.length - 1 : 0].node }
      : nextVisibleNode(visibleTree, effectiveExpanded, current, event.key as TreeKey);
    if (!next) return;
    pendingFocusKey.current = next.node.type === "folder" ? `folder:${next.node.relPath}` : `note:${next.node.id}`;
    if (next.expansion && next.node.type === "folder") {
      select({ kind: "folder", relPath: next.node.relPath });
      toggle(next.node.relPath);
      return;
    }
    select(next.node.type === "folder" ? { kind: "folder", relPath: next.node.relPath } : { kind: "note", id: next.node.id });
  }

  function openMenu(node: TreeNode, x: number, y: number, trigger: HTMLElement) {
    select(node.type === "folder" ? { kind: "folder", relPath: node.relPath } : { kind: "note", id: node.id });
    setMenu({ node, x, y, trigger });
  }

  const menuItems: ContextMenuItem[] = menu ? [
    { id: "newNote", label: t("tree.newNote"), shortcut: formatShortcut("newNote"), onSelect: () => void createNote(menu.node.type === "folder" ? menu.node.relPath : undefined) },
    ...(menu.node.type === "folder" ? [{ id: "newFolder", label: t("tree.newFolder"), shortcut: formatShortcut("newFolder"), onSelect: () => void createFolder(menu.node.relPath) }] : []),
    { id: "rename", label: t("tree.rename"), shortcut: formatShortcut("rename"), onSelect: () => setRenaming(menu.node.relPath) },
    { id: "move", label: t("tree.move"), onSelect: () => setMoveSource(menu.node) },
    ...(menu.node.type === "note" ? [{ id: "favorite", label: t(menu.node.isFavorite ? "favorites.remove" : "favorites.add"), onSelect: () => { if (menu.node.type === "note") void toggleFavorite(menu.node.id, !menu.node.isFavorite); } }] : []),
    ...(menu.node.type === "note" ? [
      { id: "exportPdf", label: `${t("viewer.export")} ▸ ${t("export.pdf")}`, separatorBefore: true, disabled: exportBusy || !canExportPdf(), title: !canExportPdf() ? t("errors.UNSUPPORTED_PLATFORM") : undefined, onSelect: () => { if (menu.node.type === "note") void exportNote(menu.node.id, menu.node.title, "pdf"); } },
      { id: "exportHtml", label: `${t("viewer.export")} ▸ ${t("export.html")}`, disabled: exportBusy, onSelect: () => { if (menu.node.type === "note") void exportNote(menu.node.id, menu.node.title, "html"); } },
      { id: "exportZip", label: `${t("viewer.export")} ▸ ${t("export.zip")}`, disabled: exportBusy, onSelect: () => { if (menu.node.type === "note") void exportNote(menu.node.id, menu.node.title, "zip"); } },
    ] : []),
    { id: "reveal", label: t("tree.reveal"), onSelect: () => void revealNode(menu.node) },
    { id: "trash", label: t("tree.trash"), onSelect: () => void deleteTreeItem(menu.node) },
  ] : [];

  return (
    <DndContext sensors={sensors} collisionDetection={treeCollisionDetection} onDragStart={(event: DragStartEvent) => setDragSource(event.active.data.current?.node as TreeNode ?? null)} onDragOver={dragOver} onDragEnd={finishDrag} onDragCancel={() => finishDrag()}>
    <div ref={setRootRef} role="tree" aria-label={t("tree.label")} tabIndex={rows.length === 0 ? 0 : -1} onKeyDown={onKeyDown} className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2 outline-none ${dragSource && dropPath === "" ? (dropValid ? "ring-2 ring-inset ring-app-accent" : "ring-2 ring-inset ring-red-500") : ""}`}>
      {visibleTree.length === 0 ? <p className="py-4 text-center text-sm text-app-muted">{t(filterQuery.trim() || filterTag ? "sidebar.noMatches" : "tree.empty")}</p> : rows.map(({ node, depth }) => (
        <TreeRow key={node.type === "folder" ? `folder:${node.relPath}` : `note:${node.id}`} node={node} depth={depth} expanded={node.type === "folder" && effectiveExpanded.has(node.relPath)} selected={isSelected(node, selected)} tabbable={selectedVisible ? isSelected(node, selected) : node === rows[0].node} onSelect={choose} onMenu={openMenu} renaming={renamingRelPath === node.relPath} onRename={(item, name) => void renameNode(item, name)} onCancelRename={() => setRenaming(null)} dragSource={dragSource} dropPath={dropPath} dropValid={dropValid} filterQuery={filterQuery} />
      ))}
      {menu && <ContextMenu items={menuItems} x={menu.x} y={menu.y} trigger={menu.trigger} onClose={() => setMenu(null)} />}
      {moveSource && <MoveDialog source={moveSource} tree={tree} onMove={(target) => { void moveNode(moveSource, target); setMoveSource(null); }} onClose={() => setMoveSource(null)} />}
    </div>
    </DndContext>
  );
}
