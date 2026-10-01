import { getCurrentWindow } from "@tauri-apps/api/window";

import { flushEditor } from "@/features/editor/saveTab";
import { resolveUnsaved } from "@/features/editor/unsavedGuard";
import { useTabsStore } from "@/stores/tabsStore";

export function installUnsavedWindowGuard(): () => void {
  let closing = false;
  let disposed = false;
  const registration = getCurrentWindow().onCloseRequested((event) => {
    const ids = useTabsStore.getState().tabs.map((tab) => tab.noteId);
    for (const id of ids) flushEditor(id);
    if (!ids.some((id) => useTabsStore.getState().isDirty(id))) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    void resolveUnsaved(ids).then((resolved) => {
      if (!disposed && !resolved.cancelled && ids.every((id) => resolved.resolved.has(id)) && !useTabsStore.getState().anyDirty()) {
        return getCurrentWindow().destroy();
      }
    }).finally(() => { closing = false; });
  });
  return () => { disposed = true; void registration.then((unlisten) => unlisten()); };
}
