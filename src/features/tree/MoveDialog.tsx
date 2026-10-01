import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { canDrop } from "@/features/tree/canDrop";
import type { TreeNode } from "@/lib/types";

interface Props {
  source: TreeNode;
  tree: TreeNode[];
  onMove: (target: string) => void;
  onClose: () => void;
}

export function MoveDialog({ source, tree, onMove, onClose }: Props) {
  const { t } = useTranslation();
  const folders: { path: string; name: string; depth: number }[] = [{ path: "", name: t("tree.root"), depth: 0 }];
  function append(nodes: TreeNode[], depth: number) {
    for (const node of nodes) if (node.type === "folder") {
      folders.push({ path: node.relPath, name: node.name, depth });
      append(node.children, depth + 1);
    }
  }
  append(tree, 1);
  const valid = folders.filter((folder) => canDrop(source, folder.path, tree));
  const [focused, setFocused] = useState(valid[0]?.path ?? "");
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { dialog.current?.querySelector<HTMLElement>("[role=listbox]")?.focus(); }, []);
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if ((event.target as HTMLElement).closest("[data-dialog-actions]")) return;
    if (event.key === "Enter") {
      event.preventDefault(); event.stopPropagation();
      if (canDrop(source, focused, tree)) onMove(focused);
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault(); event.stopPropagation();
      const index = valid.findIndex((folder) => folder.path === focused);
      if (valid.length) setFocused(valid[(index + (event.key === "ArrowDown" ? 1 : valid.length - 1)) % valid.length].path);
    }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={t("tree.moveTitle")} tabIndex={-1} onKeyDown={onKeyDown} className="max-h-[80vh] w-80 overflow-y-auto rounded-lg bg-app-surface p-4 text-app-text shadow-xl outline-none">
      <h2 className="mb-3 font-semibold">{t("tree.moveTitle")}</h2>
      <div role="listbox" tabIndex={0} aria-label={t("tree.moveTarget")} aria-activedescendant={`move-${folders.findIndex((folder) => folder.path === focused)}`}>
        {folders.map((folder, index) => {
          const allowed = canDrop(source, folder.path, tree);
          return <button key={folder.path} id={`move-${index}`} type="button" role="option" aria-selected={focused === folder.path} aria-disabled={!allowed} disabled={!allowed} onClick={() => setFocused(folder.path)} onDoubleClick={() => onMove(folder.path)} className={`block w-full rounded py-1 text-left disabled:opacity-40 ${focused === folder.path ? "bg-app-subtle" : ""}`} style={{ paddingLeft: folder.depth * 16 + 8 }} title={!allowed ? t("tree.invalidTarget") : undefined}>{folder.name}</button>;
        })}
      </div>
      <div data-dialog-actions className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose}>{t("tree.cancelMove")}</button>
        <button type="button" disabled={!canDrop(source, focused, tree)} onClick={() => onMove(focused)}>{t("tree.confirmMove")}</button>
      </div>
    </div>
  </div>;
}
