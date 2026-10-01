import { flushEditor, saveTab } from "@/features/editor/saveTab";
import { ipc } from "@/lib/ipc";
import { useTabsStore } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";

export type UnsavedDecision = "save" | "discard" | "cancel";
let pending: Promise<UnsavedDecision> | null = null;
let pendingIds = new Set<string>();
let onDiscardRecoveryDraft: (noteId: string) => void | Promise<void> = () => {};

export function setDiscardRecoveryDraftHook(callback: (noteId: string) => void | Promise<void>) {
  onDiscardRecoveryDraft = callback;
  return () => { if (onDiscardRecoveryDraft === callback) onDiscardRecoveryDraft = () => {}; };
}

export function requestUnsavedDecision(noteIds: string[]): Promise<UnsavedDecision> {
  if (pending) return pending;
  pendingIds = new Set(noteIds);
  pending = new Promise<UnsavedDecision>((resolve) => {
    useUiStore.getState().openUnsavedDialog(noteIds, (decision) => {
      useUiStore.getState().closeUnsavedDialog();
      pending = null;
      pendingIds.clear();
      resolve(decision);
    });
  });
  return pending;
}

export async function discardTab(noteId: string): Promise<boolean> {
  try {
    await ipc.clearPreviewDraft(noteId);
    await onDiscardRecoveryDraft(noteId);
    useTabsStore.getState().cancelEdit(noteId);
    return true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "UNKNOWN";
    useUiStore.getState().pushToast({ kind: "error", messageKey: `errors.${code}` });
    return false;
  }
}

// Başarılı notları döndürür; başarısız olanların taslakları korunur.
export async function resolveUnsaved(noteIds: string[]): Promise<Set<string>> {
  for (const id of noteIds) flushEditor(id);
  const dirty = [...new Set(noteIds)].filter((id) => useTabsStore.getState().isDirty(id));
  if (!dirty.length) return new Set(noteIds);
  // Açık diyaloğun kapsamı dışındaki notlar, kullanıcı görmeden işleme alınmaz.
  if (pending && dirty.some((id) => !pendingIds.has(id))) return new Set();
  const decision = await requestUnsavedDecision(dirty);
  if (decision === "cancel") return new Set();
  const resolved = new Set(noteIds.filter((id) => !dirty.includes(id)));
  for (const id of dirty) {
    const success = decision === "save" ? await saveTab(id) : await discardTab(id);
    if (success && !useTabsStore.getState().isDirty(id)) resolved.add(id);
  }
  return resolved;
}
