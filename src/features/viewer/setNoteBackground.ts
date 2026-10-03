import { writeNoteBackground } from "./noteAppearance";
import { flushEditor, notifySaveError, saveTab } from "@/features/editor/saveTab";
import { ipc } from "@/lib/ipc";
import { useTabsStore } from "@/stores/tabsStore";

export async function setNoteBackground(noteId: string, value: string): Promise<boolean> {
  flushEditor(noteId);
  const store = useTabsStore.getState();
  let doc = store.tabs.find((tab) => tab.noteId === noteId)?.doc;
  if (!doc || doc.saving || doc.externalConflict || doc.removedOnDisk) return false;
  const reading = doc.mode === "view";
  try {
    if (reading) {
      const base = await ipc.readNote(noteId);
      doc = useTabsStore.getState().tabs.find((tab) => tab.noteId === noteId)?.doc;
      if (!doc || doc.mode !== "view") return false;
      store.enterEdit(noteId, base, "code");
    }
    const draft = useTabsStore.getState().tabs.find((tab) => tab.noteId === noteId)?.doc.draft;
    if (!draft) return false;
    store.updateDraft(noteId, { html: writeNoteBackground(draft.html, value) });
    if (!reading) return true;
    const saved = await saveTab(noteId);
    if (saved && !useTabsStore.getState().isDirty(noteId)) store.cancelEdit(noteId);
    return saved;
  } catch (error) {
    if (reading && !useTabsStore.getState().isDirty(noteId)) store.cancelEdit(noteId);
    notifySaveError(error);
    return false;
  }
}
