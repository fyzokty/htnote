import { flushEditor, saveTab } from "@/features/editor/saveTab";
import { ipc } from "@/lib/ipc";
import { useTabsStore } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";

export type UnsavedDecision = "save" | "discard" | "cancel";
export interface UnsavedResolution {
  resolved: Set<string>;
  cancelled: boolean;
}
interface ResolutionState extends UnsavedResolution {
  covered: Set<string>;
  cancelledIds: Set<string>;
}
let pending: Promise<UnsavedDecision> | null = null;
let activeResolution: Promise<ResolutionState> | null = null;
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
export function resolveUnsaved(noteIds: string[]): Promise<UnsavedResolution> {
  // Her işlem önceki karar ve kayıtları bekler; hiçbir işlem kendi sonucunu beklemez.
  const resolution = activeResolution
    ? activeResolution.then((previous) => resolveUnsavedInternal(noteIds, previous))
    : resolveUnsavedInternal(noteIds);
  activeResolution = resolution;
  void resolution.then(() => {
    if (activeResolution === resolution) activeResolution = null;
  }, () => {
    if (activeResolution === resolution) activeResolution = null;
  });
  return resolution;
}

async function resolveUnsavedInternal(noteIds: string[], previous?: ResolutionState): Promise<ResolutionState> {
  for (const id of noteIds) flushEditor(id);
  const dirty = [...new Set(noteIds)].filter((id) => useTabsStore.getState().isDirty(id) && !previous?.covered.has(id));
  const covered = new Set([...(previous?.covered ?? []), ...dirty]);
  const cancelledIds = new Set(previous?.cancelledIds ?? []);
  const cancelled = noteIds.some((id) => cancelledIds.has(id) && useTabsStore.getState().isDirty(id));
  const resolved = new Set(noteIds.filter((id) => !useTabsStore.getState().isDirty(id)));
  if (!dirty.length) return { resolved, cancelled, covered, cancelledIds };
  const decision = await requestUnsavedDecision(dirty);
  if (decision === "cancel") {
    for (const id of dirty) cancelledIds.add(id);
    return { resolved: new Set(), cancelled: true, covered, cancelledIds };
  }
  for (const id of dirty) {
    const success = decision === "save" ? await saveTab(id) : await discardTab(id);
    if (success && !useTabsStore.getState().isDirty(id)) resolved.add(id);
  }
  return { resolved, cancelled, covered, cancelledIds };
}
