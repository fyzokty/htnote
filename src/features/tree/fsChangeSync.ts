import { onFsChange } from "@/lib/events";
import { refreshTrashCount } from "@/features/trash/deleteCoordinator";
import { useTreeStore } from "@/stores/treeStore";

export function startFsChangeSync() {
  let disposed = false;
  let unlisten: (() => void) | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  void onFsChange((payload) => {
    if (disposed) return;
    if (payload.trashChanged) void refreshTrashCount().catch(() => {});
    if (!payload.treeChanged) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (!disposed) void useTreeStore.getState().refresh().catch(() => {});
    }, 150);
  }).then((stop) => {
    if (disposed) stop();
    else unlisten = stop;
  }).catch(() => {});

  return () => {
    disposed = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    unlisten?.();
  };
}
