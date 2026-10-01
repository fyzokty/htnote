import { ipc } from "@/lib/ipc";
import { useTabsStore } from "@/stores/tabsStore";
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
  const snapshot = { ...doc.draft };
  useTabsStore.getState().markSaving(noteId);
  try {
    const result = await ipc.saveNote(noteId, {
      html: snapshot.html, css: snapshot.css ?? "", js: snapshot.js ?? "", expectedHash: doc.base.contentHash,
    });
    useTabsStore.getState().saveSucceeded(noteId, { ...snapshot, contentHash: result.contentHash });
    return true;
  } catch (error) {
    useTabsStore.getState().saveFailed(noteId);
    notifySaveError(error);
    return false;
  }
}
