import { useDialogActive, useDialogBackdrop } from "@/components/ui/useDialogPresence";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { canDrop } from "@/features/tree/canDrop";
import type { TreeNode } from "@/lib/types";

interface Props {
  source: TreeNode;
  tree: TreeNode[];
  onMove: (target: string) => void;
  onClose: () => void;
}

export function MoveDialog({ source, tree, onMove, onClose }: Props) {
  const active = useDialogActive();
  const backdrop = useDialogBackdrop();
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
  const listbox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLElement>("[role=listbox]")?.focus();
    return () => previous?.focus();
  }, [active]);
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === "Tab") {
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('[role="listbox"], button:not(:disabled):not([tabindex="-1"])') ?? [])];
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.target !== listbox.current) return;
    if (event.key === "Enter") {
      event.preventDefault(); event.stopPropagation();
      if (canDrop(source, focused, tree)) onMove(focused);
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault(); event.stopPropagation();
      const index = valid.findIndex((folder) => folder.path === focused);
      if (valid.length) {
        const next = index < 0 ? 0 : (index + (event.key === "ArrowDown" ? 1 : valid.length - 1)) % valid.length;
        setFocused(valid[next].path);
      }
    }
  }
  return <div {...backdrop} className="htnote-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-app-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={t("tree.moveTitle")} tabIndex={-1} onKeyDown={active ? onKeyDown : undefined} className="htnote-dialog-surface max-h-[80vh] w-80 overflow-y-auto  p-4 text-app-text shadow-xl outline-none">
      <h2 className="mb-3 font-semibold">{t("tree.moveTitle")}</h2>
      <div ref={listbox} role="listbox" tabIndex={0} aria-label={t("tree.moveTarget")} aria-activedescendant={valid.some((folder) => folder.path === focused) ? `move-${folders.findIndex((folder) => folder.path === focused)}` : undefined}>
        {folders.map((folder, index) => {
          const allowed = canDrop(source, folder.path, tree);
          return <Button variant="ghost" size="sm" key={folder.path} id={`move-${index}`} type="button" tabIndex={-1} role="option" aria-selected={allowed && focused === folder.path} aria-disabled={!allowed} disabled={!allowed} onClick={() => { setFocused(folder.path); listbox.current?.focus(); }} onDoubleClick={() => onMove(folder.path)} className={`block w-full rounded py-1 text-left disabled:opacity-40 ${focused === folder.path && allowed ? "bg-app-subtle" : ""}`} style={{ paddingLeft: folder.depth * 16 + 8 }} title={!allowed ? t("tree.invalidTarget") : undefined}>{folder.name}</Button>;
        })}
      </div>
      <div data-dialog-actions className="mt-4 flex justify-end gap-2">
        <Button type="button" onClick={onClose}>{t("tree.cancelMove")}</Button>
        <Button variant="primary" type="button" disabled={!canDrop(source, focused, tree)} onClick={() => onMove(focused)}>{t("tree.confirmMove")}</Button>
      </div>
    </div>
  </div>;
}
