import type { DocState } from "@/features/editor/docState";
import { saveTab } from "@/features/editor/saveTab";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTabsStore } from "@/stores/tabsStore";

const AUTO_SAVE_DELAY = 2000;
const changeListeners = new Set<(noteId: string) => void>();

export function notifyAutoSaveChange(noteId: string) {
  for (const listener of changeListeners) listener(noteId);
}

function draftChanged(doc: DocState, before?: DocState): boolean {
  return doc.draft?.html !== before?.draft?.html
    || doc.draft?.css !== before?.draft?.css
    || doc.draft?.js !== before?.draft?.js;
}

export function installAutoSave(): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const running = new Set<string>();
  const failed = new Set<string>();
  let disposed = false;
  const enabled = () => useSettingsStore.getState().settings?.autoSave === true;
  const currentDoc = (id: string) => useTabsStore.getState().tabs.find((tab) => tab.noteId === id)?.doc;

  function cancel(id: string) {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
  }

  function eligible(id: string, doc: DocState | undefined): boolean {
    return enabled() && !!doc && doc.mode !== "view" && doc.dirty && !!doc.base && !!doc.draft
      && !doc.saving && !doc.externalConflict && !doc.removedOnDisk && !running.has(id) && !failed.has(id);
  }

  function schedule(id: string) {
    cancel(id);
    if (disposed || !eligible(id, currentDoc(id))) return;
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      if (disposed || !eligible(id, currentDoc(id))) return;
      running.add(id);
      // Manuel kayıtla aynı flush, hash denetimi ve durum güncellemeleri kullanılır.
      void saveTab(id).then((saved) => {
        running.delete(id);
        if (disposed) return;
        if (saved) schedule(id);
        else failed.add(id);
      });
    }, AUTO_SAVE_DELAY));
  }

  const unsubscribeTabs = useTabsStore.subscribe((state, previous) => {
    const old = new Map(previous.tabs.map((tab) => [tab.noteId, tab.doc]));
    for (const tab of state.tabs) {
      const id = tab.noteId;
      const doc = tab.doc;
      const before = old.get(id);
      old.delete(id);
      const changed = draftChanged(doc, before);
      const resolved = !!before?.externalConflict && !doc.externalConflict;
      const saved = before?.saving && !doc.saving && doc.base !== before.base;
      if (changed || resolved || saved || !doc.dirty || doc.mode === "view") failed.delete(id);
      // Hata sonrası durum/ayar güncellemeleri aynı taslağı tekrar kaydetmez.
      if (before?.saving && !doc.saving && !saved) failed.add(id);
      if (!eligible(id, doc)) cancel(id);
      else if (changed || resolved || saved || !before?.dirty || before.mode === "view") schedule(id);
    }
    for (const id of old.keys()) {
      cancel(id);
      failed.delete(id);
    }
  });
  const unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
    if (state.settings?.autoSave === previous.settings?.autoSave) return;
    for (const tab of useTabsStore.getState().tabs) schedule(tab.noteId);
  });
  changeListeners.add(schedule);
  for (const tab of useTabsStore.getState().tabs) schedule(tab.noteId);

  return () => {
    disposed = true;
    unsubscribeTabs();
    unsubscribeSettings();
    changeListeners.delete(schedule);
    for (const id of timers.keys()) cancel(id);
  };
}
