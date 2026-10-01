import { flushEditor, saveTab } from "@/features/editor/saveTab";
import { ipc } from "@/lib/ipc";
import { useTabsStore } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";

export type UnsavedDecision = "save" | "discard" | "cancel";
let pending: Promise<UnsavedDecision> | null = null;
let activeResolution: Promise<Set<string>> | null = null;
let onDiscardRecoveryDraft: (noteId: string) => void | Promise<void> = () => {};

export function setDiscardRecoveryDraftHook(callback: (noteId: string) => void | Promise<void>) {
  onDiscardRecoveryDraft = callback;
  return () => { if (onDiscardRecoveryDraft === callback) onDiscardRecoveryDraft = () => {}; };
}

export function requestUnsavedDecision(noteIds: string[]): Promise<UnsavedDecision> {
  if (pending) return pending;
  pending = new Promise<UnsavedDecision>((resolve) => {
    useUiStore.getState().openUnsavedDialog(noteIds, (decision) => {
      useUiStore.getState().closeUnsavedDialog();
      pending = null;
      resolve(decision);
    });
  });
  return pending;
}

export async function discardTab(noteId: string): Promise<boolean> {
  try {
    await ipc.clearPreviewDraft(noteId);
  } catch (error) {
    console.warn("Could not clear preview draft for discarded tab", noteId, error);
  }
  try {
    await onDiscardRecoveryDraft(noteId);
  } catch (error) {
    console.warn("Could not clear recovery draft for discarded tab", noteId, error);
  }
  useTabsStore.getState().cancelEdit(noteId);
  return true;
}

// Başarılı notları döndürür; başarısız olanların taslakları korunur.
export function resolveUnsaved(noteIds: string[]): Promise<Set<string>> {
  // Her işlem önceki karar ve kayıtları bekler; hiçbir işlem kendi sonucunu beklemez.
  const resolution = activeResolution
    ? activeResolution.then(() => resolveUnsavedInternal(noteIds), () => resolveUnsavedInternal(noteIds))
    : resolveUnsavedInternal(noteIds);
  activeResolution = resolution;
  void resolution.then(() => {
    if (activeResolution === resolution) activeResolution = null;
  }, () => {
    if (activeResolution === resolution) activeResolution = null;
  });
  return resolution;
}

async function resolveUnsavedInternal(noteIds: string[]): Promise<Set<string>> {
  for (const id of noteIds) flushEditor(id);
  const dirty = [...new Set(noteIds)].filter((id) => useTabsStore.getState().isDirty(id));
  if (!dirty.length) return new Set(noteIds);
  const decision = await requestUnsavedDecision(dirty);
  if (decision === "cancel") return new Set();
  const resolved = new Set(noteIds.filter((id) => !dirty.includes(id)));
  for (const id of dirty) {
    const success = decision === "save" ? await saveTab(id) : await discardTab(id);
    if (success && !useTabsStore.getState().isDirty(id)) resolved.add(id);
  }
  return resolved;
}
