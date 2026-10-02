import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
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
        <Button type="button" disabled={!items.length} onClick={() => void empty()} variant="danger">{t("trash.emptyTrash")}</Button>
      </div>
      {!items.length ? <p className="text-app-muted">{t("trash.empty")}</p> : (
        <ul className="space-y-2">{items.map((item) => (
          <li key={item.trashId} className="flex flex-wrap items-center gap-3 rounded border border-app-border p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.title}</p>
              <p className="break-all text-sm text-app-muted">{t(`trash.kind.${item.kind}`)} · {item.originalRelPath} · {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.deletedAt))}</p>
            </div>
            <Button type="button" onClick={() => void restore(item)} variant="primary" size="sm">{t("trash.restore")}</Button>
            <Button type="button" onClick={() => void remove(item)} variant="danger" size="sm">{t("trash.deletePermanently")}</Button>
          </li>
        ))}</ul>
      )}
    </div>
  );
}
