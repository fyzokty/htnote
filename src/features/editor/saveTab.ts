import { ipc } from "@/lib/ipc";
import { deleteRecoveryDraft } from "@/features/editor/recoveryDrafts";
import { useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

const flushers = new Map<string, () => void>();

export function registerEditorFlush(noteId: string, flush: () => void): () => void {
  flushers.set(noteId, flush);
  return () => { if (flushers.get(noteId) === flush) flushers.delete(noteId); };
}

export function flushEditor(noteId: string) {
  flushers.get(noteId)?.();
}

export function notifySaveError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code : "UNKNOWN";
  useUiStore.getState().pushToast({ kind: "error", messageKey: code === "CONFLICT" ? "editor.session.conflict" : `errors.${code}` });
}

export async function saveTab(noteId: string): Promise<boolean> {
  flushEditor(noteId);
  const doc = useTabsStore.getState().tabs.find((tab) => tab.noteId === noteId)?.doc;
  if (!doc?.base || !doc.draft || doc.mode === "view" || doc.saving) return false;
  if (doc.externalConflict || doc.removedOnDisk) {
    useUiStore.getState().pushToast({ kind: "info", messageKey: "external.chooseFirst" });
    return false;
  }
  const snapshot = { ...doc.draft };
  useTabsStore.getState().markSaving(noteId);
  try {
    const result = await ipc.saveNote(noteId, {
      html: snapshot.html, css: snapshot.css ?? "", js: snapshot.js ?? "", expectedHash: doc.base.contentHash,
    });
    useTabsStore.getState().saveSucceeded(noteId, { ...snapshot, contentHash: result.contentHash });
    await deleteRecoveryDraft(noteId);
    // IPC beklenirken yapılan görsel düzenleme henüz debounce kuyruğunda olabilir.
    // Düzenlemeden çıkma kararı verilmeden önce onu taslağa aktar.
    flushEditor(noteId);
    if (useTabsStore.getState().isDirty(noteId)) {
      // Kayıt sırasında yeni düzenleme geldiyse onun için yeniden zamanlayıcı kurulur.
      useTabsStore.getState().updateDraft(noteId, {});
    }
    return true;
  } catch (error) {
    useTabsStore.getState().saveFailed(noteId);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "CONFLICT") {
      try {
        const disk = await ipc.readNote(noteId);
        useTabsStore.getState().markConflict(noteId, disk.contentHash);
      } catch (readError) {
        if (typeof readError === "object" && readError !== null && "code" in readError && readError.code === "NOTE_NOT_FOUND") {
          const note = useTreeStore.getState().findNoteById(noteId);
          useTabsStore.getState().markRemoved(noteId, note?.title ?? null, note?.relPath.split("/").slice(0, -1).join("/") ?? "");
        } else {
          notifySaveError(readError);
        }
      }
    } else {
      notifySaveError(error);
    }
    return false;
  }
}
