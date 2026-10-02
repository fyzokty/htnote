import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { restoreAndReveal, refreshTrashCount } from "@/features/trash/deleteCoordinator";
import { notifyError } from "@/lib/errors";
import { ipc } from "@/lib/ipc";
import type { TrashItem } from "@/lib/types";
import { useUiStore } from "@/stores/uiStore";

export function TrashView() {
  const { t, i18n } = useTranslation();
  const revision = useUiStore((state) => state.trashRevision);
  const confirm = useUiStore((state) => state.confirm);
  const [items, setItems] = useState<TrashItem[]>([]);

  useEffect(() => {
    let active = true;
    void ipc.listTrash().then((list) => { if (active) setItems(list); }).catch(notifyError);
    return () => { active = false; };
  }, [revision]);

  async function restore(item: TrashItem) {
    await restoreAndReveal(item.trashId);
  }

  async function remove(item: TrashItem) {
    if (!await confirm("trash.deleteTitle", "trash.deleteMessage", { name: item.title })) return;
    try {
      await ipc.deletePermanently(item.trashId);
      setItems(await refreshTrashCount());
    } catch (error) { notifyError(error); }
  }

  async function empty() {
    if (!await confirm("trash.emptyTitle", "trash.emptyMessage")) return;
    try {
      await ipc.emptyTrash();
      setItems(await refreshTrashCount());
    } catch (error) { notifyError(error); }
  }

  return (
    <div className="min-h-0 w-full overflow-y-auto p-6 text-app-text">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t("sidebar.trash")}</h2>
        <button type="button" disabled={!items.length} onClick={() => void empty()} className="rounded border border-app-border px-3 py-2 text-sm disabled:opacity-50">{t("trash.emptyTrash")}</button>
      </div>
      {!items.length ? <p className="text-app-muted">{t("trash.empty")}</p> : (
        <ul className="space-y-2">{items.map((item) => (
          <li key={item.trashId} className="flex flex-wrap items-center gap-3 rounded border border-app-border p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.title}</p>
              <p className="break-all text-sm text-app-muted">{t(`trash.kind.${item.kind}`)} · {item.originalRelPath} · {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.deletedAt))}</p>
            </div>
            <button type="button" onClick={() => void restore(item)} className="rounded border border-app-border px-3 py-1">{t("trash.restore")}</button>
            <button type="button" onClick={() => void remove(item)} className="rounded border border-red-600 px-3 py-1 text-red-600">{t("trash.deletePermanently")}</button>
          </li>
        ))}</ul>
      )}
    </div>
  );
}
