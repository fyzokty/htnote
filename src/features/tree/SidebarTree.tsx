import { memo, useCallback, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { useTranslation } from "react-i18next";

import { nextVisibleNode, visibleNodes } from "@/features/tree/treeNavigation";
import type { TreeKey } from "@/features/tree/treeNavigation";
import type { TreeNode, TreeSelection } from "@/lib/types";
import { useTreeStore } from "@/stores/treeStore";

interface RowProps {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  selected: boolean;
  onSelect: (node: TreeNode) => void;
}

const TreeRow = memo(function TreeRow({ node, depth, expanded, selected, onSelect }: RowProps) {
  const { t } = useTranslation();
  const isFolder = node.type === "folder";
  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={isFolder ? expanded : undefined}
      aria-selected={selected}
      aria-label={isFolder ? t("tree.folder", { name: node.name }) : t("tree.note", { name: node.title })}
      tabIndex={selected ? 0 : -1}
      data-tree-key={isFolder ? `folder:${node.relPath}` : `note:${node.id}`}
      onClick={() => onSelect(node)}
      className={`flex min-w-0 cursor-pointer items-center gap-1 rounded-md py-1 pr-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-app-accent ${selected ? "bg-app-accent text-app-accent-text" : "text-app-text hover:bg-app-subtle"}`}
      style={{ paddingLeft: depth * 16 + 4 }}
    >
      {isFolder ? (expanded ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />) : <span className="size-4 shrink-0" />}
      {isFolder ? <Folder className="size-4 shrink-0" aria-hidden /> : <FileText className="size-4 shrink-0" aria-hidden />}
      <span className="truncate">{isFolder ? node.name : node.title}</span>
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
  const selected = useTreeStore((state) => state.selected);
  const select = useTreeStore((state) => state.select);
  const toggle = useTreeStore((state) => state.toggle);
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingFocusKey = useRef<string | null>(null);
  const rows = visibleNodes(tree, expanded);

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
      select({ kind: "folder", relPath: node.relPath });
      toggle(node.relPath);
    } else {
      select({ kind: "note", id: node.id });
      onOpenNote(node.id);
    }
  }, [select, toggle, onOpenNote]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys: TreeKey[] = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    if (event.key !== "Enter" && !keys.includes(event.key as TreeKey)) return;
    event.preventDefault();
    const focusedKey = (event.target as HTMLElement).closest<HTMLElement>("[data-tree-key]")?.dataset.treeKey;
    const current = rows.find(({ node }) => focusedKey === (node.type === "folder" ? `folder:${node.relPath}` : `note:${node.id}`))?.node
      ?? rows.find(({ node }) => isSelected(node, selected))?.node ?? null;
    if (event.key === "Enter") {
      if (current) {
        if (current.type === "folder") pendingFocusKey.current = `folder:${current.relPath}`;
        choose(current);
      }
      return;
    }
    const next = nextVisibleNode(tree, expanded, current, event.key as TreeKey);
    if (!next) return;
    pendingFocusKey.current = next.node.type === "folder" ? `folder:${next.node.relPath}` : `note:${next.node.id}`;
    if (next.expansion && next.node.type === "folder") {
      select({ kind: "folder", relPath: next.node.relPath });
      toggle(next.node.relPath);
      return;
    }
    select(next.node.type === "folder" ? { kind: "folder", relPath: next.node.relPath } : { kind: "note", id: next.node.id });
  }

  return (
    <div ref={rootRef} role="tree" aria-label={t("tree.label")} tabIndex={selected ? -1 : 0} onKeyDown={onKeyDown} className="min-h-0 flex-1 overflow-y-auto px-3 py-2 outline-none">
      {tree.length === 0 ? <p className="py-4 text-center text-sm text-app-muted">{t("tree.empty")}</p> : rows.map(({ node, depth }) => (
        <TreeRow key={node.type === "folder" ? `folder:${node.relPath}` : `note:${node.id}`} node={node} depth={depth} expanded={node.type === "folder" && expanded.has(node.relPath)} selected={isSelected(node, selected)} onSelect={choose} />
      ))}
    </div>
  );
}
