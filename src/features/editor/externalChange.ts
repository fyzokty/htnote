import type { DocState } from "@/features/editor/docState";
import { fsChangeBus } from "@/lib/events";
import { ipc } from "@/lib/ipc";
import type { FsChangePayload } from "@/lib/types";
import { useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

export type ExternalDecision = "ignore" | "silentReload" | "showConflictBanner" | "closeTab" | "showRemovedBanner";

export function decideExternalChange(tabState: DocState, newHash: string | null, removed: boolean): ExternalDecision {
  if (removed) return tabState.dirty ? "showRemovedBanner" : "closeTab";
  if (tabState.saving || tabState.removedOnDisk || newHash === tabState.base?.contentHash) return "ignore";
  return tabState.mode === "view" || !tabState.dirty ? "silentReload" : "showConflictBanner";
}

function currentDoc(id: string) {
  return useTabsStore.getState().tabs.find((tab) => tab.noteId === id)?.doc;
}

function afterSaving(id: string): Promise<void> {
  if (!currentDoc(id)?.saving) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useTabsStore.subscribe(() => {
      if (!currentDoc(id)?.saving) {
        unsubscribe();
        resolve();
      }
    });
  });
}

export async function handleExternalChanges(payload: FsChangePayload): Promise<void> {
  for (const id of payload.removedNoteIds) {
    const note = useTreeStore.getState().findNoteById(id);
    const parent = note?.relPath.split("/").slice(0, -1).join("/") ?? "";
    let outcome: "closed" | "marked" | "missing" | "saving";
    do {
      await afterSaving(id);
      outcome = useTabsStore.getState().handleRemoved(id, note?.title ?? null, parent);
    } while (outcome === "saving");
    if (outcome === "closed") useUiStore.getState().pushToast({ kind: "info", messageKey: "external.closed" });
  }
  for (const id of payload.changedNoteIds) {
    if (!currentDoc(id) || payload.removedNoteIds.includes(id)) continue;
    await afterSaving(id);
    try {
      const disk = await ipc.readNote(id);
      await afterSaving(id);
      const doc = currentDoc(id);
      if (!doc) continue;
      const decision = decideExternalChange(doc, disk.contentHash, false);
      if (decision === "silentReload") useTabsStore.getState().reloadBase(id, disk);
      if (decision === "showConflictBanner") useTabsStore.getState().markConflict(id, disk.contentHash);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "NOTE_NOT_FOUND") {
        await handleExternalChanges({ ...payload, changedNoteIds: [], removedNoteIds: [id] });
      }
    }
  }
}

export function installExternalChangeListener() {
  let pending: Promise<void> = Promise.resolve();
  return fsChangeBus.subscribe((payload) => {
    pending = pending.then(() => handleExternalChanges(payload)).catch(() => {});
  });
}
