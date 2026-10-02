import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

export function UnsavedChangesDialog() {
  const { t } = useTranslation();
  const dialog = useUiStore((state) => state.unsavedDialog);
  const tree = useTreeStore((state) => state.tree);
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dialog?.resolve("cancel");
      }
      if (event.key !== "Tab") return;
      const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [dialog]);

  if (!dialog) return null;
  const title = dialog.noteIds.length > 1 ? t("unsaved.multipleTitle") : t("unsaved.title");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="unsaved-title" aria-describedby="unsaved-description" className="w-full max-w-md rounded-lg border border-app-border bg-app-surface p-5 text-app-text shadow-xl">
        <h2 id="unsaved-title" className="text-lg font-semibold">{title}</h2>
        <p id="unsaved-description" className="mt-2 text-sm text-app-muted">{t(dialog.purpose === "export" ? "export.unsaved" : "unsaved.description")}</p>
        {dialog.noteIds.length > 1 && <ul className="mt-3 max-h-40 list-disc overflow-auto pl-5 text-sm">{dialog.noteIds.map((id) => {
          const findTitle = (nodes: typeof tree): string | null => {
            for (const node of nodes) {
              if (node.type === "note" && node.id === id) return node.title;
              if (node.type === "folder") { const found = findTitle(node.children); if (found) return found; }
            }
            return null;
          };
          return <li key={id}>{findTitle(tree) ?? t("tabs.untitled")}</li>;
        })}</ul>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={cancel} type="button" onClick={() => dialog.resolve("cancel")}>{t("unsaved.cancel")}</button>
          <button type="button" onClick={() => dialog.resolve("discard")}>{t(dialog.purpose === "export" ? "export.anyway" : "unsaved.discard")}</button>
          <button type="button" onClick={() => dialog.resolve("save")} className="rounded bg-app-accent px-3 py-1 text-app-accent-text">{dialog.purpose === "export" ? t("export.saveAndExport") : dialog.noteIds.length > 1 ? t("unsaved.saveAll") : t("unsaved.save")}</button>
        </div>
      </div>
    </div>
  );
}
