import { ArrowRight, Ban, FileText, Folder, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { TreeNode } from "@/lib/types";

interface Props {
  node: TreeNode;
  expanded: boolean;
  noteCount?: number;
  hasDropTarget: boolean;
  dropValid: boolean;
  targetName: string | null;
}

export function TreeDragPreview({ node, expanded, noteCount, hasDropTarget, dropValid, targetName }: Props) {
  const { t } = useTranslation();
  const isFolder = node.type === "folder";
  const label = isFolder ? node.name : node.title;
  const Icon = isFolder ? (expanded ? FolderOpen : Folder) : FileText;
  return (
    <div
      data-testid="tree-drag-preview"
      data-drop-valid={dropValid}
      className={`flex w-max max-w-[min(480px,100vw)] items-center gap-1 border border-app-card-border bg-app-card px-2 py-1 text-sm text-app-text ${!hasDropTarget || dropValid ? "cursor-grabbing" : "cursor-not-allowed"}`}
      style={{ borderRadius: "var(--app-radius-control)", boxShadow: "var(--app-shadow-card)" }}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="max-w-[240px] truncate" title={label}>{label}</span>
      {isFolder && <span className="shrink-0 text-xs text-app-muted">{noteCount ?? node.children.filter((child) => child.type === "note").length}</span>}
      {hasDropTarget && <span className={`ml-2 flex min-w-0 items-center gap-1 text-xs ${dropValid ? "text-app-accent" : "text-app-danger"}`}>
        {dropValid ? <ArrowRight className="size-3 shrink-0" aria-hidden /> : <Ban className="size-3 shrink-0" aria-hidden />}
        <span className="max-w-[160px] truncate">{dropValid ? t("tree.dragTarget", { name: targetName }) : t("tree.dragInvalid")}</span>
      </span>}
    </div>
  );
}
