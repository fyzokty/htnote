import { create } from "zustand";

import {
  cancelEdit, createDocState, enterEdit, keepMine, loadFromDisk, markConflict, markRemoved,
  markSaving, reloadBase, saveFailed, saveSucceeded, switchMode, updateDraft,
} from "@/features/editor/docState";
import type { DocBase, DocDraft, DocState } from "@/features/editor/docState";
import { resolveUnsaved } from "@/features/editor/unsavedGuard";
import { ipc } from "@/lib/ipc";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTreeStore } from "@/stores/treeStore";

export interface Tab {
  noteId: string;
  doc: DocState;
}

export type BeforeCloseGuard = (noteId: string) => boolean | Promise<boolean>;

interface TabsState {
  tabs: Tab[];
  activeId: string | null;
  restored: boolean;
  openNote: (id: string, options?: { activate?: boolean }) => void;
  close: (id: string) => Promise<boolean>;
  closeOthers: (id: string) => Promise<void>;
  activate: (id: string) => void;
  next: () => void;
  prev: () => void;
  move: (fromIndex: number, toIndex: number) => void;
  replaceMissing: (existingIds: Iterable<string>) => void;
  restore: (existingIds: Iterable<string>) => void;
  enterEdit: (id: string, base: DocBase, preferred?: "visual" | "code", visualAvailable?: boolean) => void;
  switchMode: (id: string, mode: "visual" | "code", visualAvailable?: boolean) => void;
  updateDraft: (id: string, partial: Partial<DocDraft>) => void;
  markSaving: (id: string) => void;
  saveSucceeded: (id: string, newBase: DocBase, savedAt?: number) => void;
  saveFailed: (id: string) => void;
  cancelEdit: (id: string) => void;
  reloadBase: (id: string, newBase: DocBase) => void;
  markConflict: (id: string, diskHash: string) => void;
  keepMine: (id: string, diskBase: DocBase) => void;
  loadFromDisk: (id: string, base: DocBase) => void;
  markRemoved: (id: string, title: string | null, parent: string) => void;
  handleRemoved: (id: string, title: string | null, parent: string) => "closed" | "marked" | "missing" | "saving";
  retargetTab: (oldId: string, newId: string, newBase: DocBase) => void;
  isDirty: (id: string) => boolean;
  anyDirty: () => boolean;
  setBeforeCloseGuard: (guard: BeforeCloseGuard) => () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let beforeClose: BeforeCloseGuard = () => true;

function persist(tabs: Tab[], activeId: string | null) {
  if (!useTabsStore.getState().restored) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (useSettingsStore.getState().settings) {
      void useSettingsStore.getState().update({
        openTabs: tabs.map((tab) => tab.noteId),
        activeTab: activeId,
      }).catch(() => {});
    }
  }, 500);
}

function removeTab(tabs: Tab[], activeId: string | null, id: string) {
  const index = tabs.findIndex((tab) => tab.noteId === id);
  if (index < 0) return { tabs, activeId };
  const remaining = tabs.filter((tab) => tab.noteId !== id);
  const nextActive = activeId === id
    ? (remaining[index] ?? remaining[index - 1])?.noteId ?? null
    : activeId;
  return { tabs: remaining, activeId: nextActive };
}

function clearClosedPreview(id: string) {
  void ipc.clearPreviewDraft(id).catch((error: unknown) => {
    console.warn("Could not clear preview draft for closed tab", id, error);
  });
}

function updateTabDoc(tabs: Tab[], id: string, transition: (doc: DocState) => DocState): Tab[] {
  const index = tabs.findIndex((tab) => tab.noteId === id);
  if (index < 0) return tabs;
  const doc = transition(tabs[index].doc);
  if (doc === tabs[index].doc) return tabs;
  const next = [...tabs];
  next[index] = { ...tabs[index], doc };
  return next;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  restored: false,
  openNote(id, { activate = true } = {}) {
    const current = get();
    const alreadyOpen = current.tabs.some((tab) => tab.noteId === id);
    const tabs = alreadyOpen
      ? current.tabs
      : [...current.tabs, { noteId: id, doc: createDocState() }];
    const activeId = activate ? id : current.activeId;
    if (tabs !== current.tabs || activeId !== current.activeId) {
      set({ tabs, activeId });
      persist(tabs, activeId);
    }
    if (activate) useTreeStore.getState().revealNote(id);
  },
  async close(id) {
    if (!get().tabs.some((tab) => tab.noteId === id)) return false;
    if (!await beforeClose(id)) return false;
    if (!(await resolveUnsaved([id])).resolved.has(id) || get().isDirty(id)) return false;
    const current = get();
    const result = removeTab(current.tabs, current.activeId, id);
    if (result.tabs === current.tabs) return false;
    set(result);
    persist(result.tabs, result.activeId);
    clearClosedPreview(id);
    if (result.activeId && result.activeId !== current.activeId) {
      useTreeStore.getState().revealNote(result.activeId);
    }
    return true;
  },
  async closeOthers(id) {
    if (!get().tabs.some((tab) => tab.noteId === id)) return;
    const candidates = get().tabs.filter((tab) => tab.noteId !== id).map((tab) => tab.noteId);
    const allowed: string[] = [];
    for (const candidate of candidates) {
      if (await beforeClose(candidate)) allowed.push(candidate);
    }
    const resolved = await resolveUnsaved(allowed);
    if (resolved.cancelled) return;
    for (const candidate of allowed) {
      if (!resolved.resolved.has(candidate) || get().isDirty(candidate)) continue;
      const current = get();
      const result = removeTab(current.tabs, current.activeId, candidate);
      if (result.tabs === current.tabs) continue;
      set(result);
      persist(result.tabs, result.activeId);
      clearClosedPreview(candidate);
    }
    get().activate(id);
  },
  activate(id) {
    if (!get().tabs.some((tab) => tab.noteId === id)) return;
    if (get().activeId !== id) {
      set({ activeId: id });
      persist(get().tabs, id);
    }
    useTreeStore.getState().revealNote(id);
  },
  next() {
    const { tabs, activeId } = get();
    if (!tabs.length) return;
    const index = tabs.findIndex((tab) => tab.noteId === activeId);
    get().activate(tabs[(index + 1) % tabs.length].noteId);
  },
  prev() {
    const { tabs, activeId } = get();
    if (!tabs.length) return;
    const index = tabs.findIndex((tab) => tab.noteId === activeId);
    get().activate(tabs[index < 0 ? tabs.length - 1 : (index + tabs.length - 1) % tabs.length].noteId);
  },
  move(fromIndex, toIndex) {
    const tabs = [...get().tabs];
    if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= tabs.length || !Number.isFinite(toIndex)) return;
    const target = Math.max(0, Math.min(tabs.length - 1, Math.trunc(toIndex)));
    if (fromIndex === target) return;
    const [tab] = tabs.splice(fromIndex, 1);
    tabs.splice(target, 0, tab);
    set({ tabs });
    persist(tabs, get().activeId);
  },
  replaceMissing(existingIds) {
    const existing = new Set(existingIds);
    const previousActive = get().activeId;
    let { tabs, activeId } = get();
    const previous = tabs;
    for (const tab of previous) {
      if (!existing.has(tab.noteId) && !tab.doc.dirty && !tab.doc.saving && !tab.doc.removedOnDisk) {
        ({ tabs, activeId } = removeTab(tabs, activeId, tab.noteId));
        clearClosedPreview(tab.noteId);
      }
    }
    if (tabs === previous) return;
    set({ tabs, activeId });
    persist(tabs, activeId);
    if (activeId && activeId !== previousActive) useTreeStore.getState().revealNote(activeId);
  },
  restore(existingIds) {
    if (get().restored) return;
    const settings = useSettingsStore.getState().settings;
    if (!settings) return;
    const existing = new Set(existingIds);
    const ids = [...new Set(settings.openTabs.filter((id) => existing.has(id)))];
    const tabs = ids.map((noteId) => ({ noteId, doc: createDocState() }));
    const activeId = ids.includes(settings.activeTab ?? "") ? settings.activeTab : ids[0] ?? null;
    set({ tabs, activeId, restored: true });
    if (activeId) useTreeStore.getState().revealNote(activeId);
    if (ids.length !== settings.openTabs.length || activeId !== settings.activeTab) persist(tabs, activeId);
  },
  enterEdit(id, base, preferred, visualAvailable) {
    set((state) => ({ tabs: updateTabDoc(state.tabs, id, (doc) => enterEdit(doc, base, preferred, visualAvailable)) }));
  },
  switchMode(id, mode, visualAvailable) {
    set((state) => ({ tabs: updateTabDoc(state.tabs, id, (doc) => switchMode(doc, mode, visualAvailable)) }));
  },
  updateDraft(id, partial) {
    set((state) => ({ tabs: updateTabDoc(state.tabs, id, (doc) => updateDraft(doc, partial)) }));
  },
  markSaving(id) {
    set((state) => ({ tabs: updateTabDoc(state.tabs, id, markSaving) }));
  },
  saveSucceeded(id, newBase, savedAt) {
    set((state) => ({ tabs: updateTabDoc(state.tabs, id, (doc) => saveSucceeded(doc, newBase, savedAt)) }));
  },
  saveFailed(id) {
    set((state) => ({ tabs: updateTabDoc(state.tabs, id, saveFailed) }));
  },
  cancelEdit(id) {
    set((state) => ({ tabs: updateTabDoc(state.tabs, id, cancelEdit) }));
  },
  reloadBase(id, newBase) {
    set((state) => ({ tabs: updateTabDoc(state.tabs, id, (doc) => reloadBase(doc, newBase)) }));
  },
  markConflict(id, diskHash) {
    set((state) => ({ tabs: updateTabDoc(state.tabs, id, (doc) => markConflict(doc, diskHash)) }));
  },
  keepMine(id, diskBase) {
    set((state) => ({ tabs: updateTabDoc(state.tabs, id, (doc) => keepMine(doc, diskBase)) }));
  },
  loadFromDisk(id, base) {
    set((state) => ({ tabs: updateTabDoc(state.tabs, id, (doc) => loadFromDisk(doc, base)) }));
  },
  markRemoved(id, title, parent) {
    set((state) => ({ tabs: updateTabDoc(state.tabs, id, (doc) => markRemoved(doc, title, parent)) }));
  },
  handleRemoved(id, title, parent) {
    const current = get();
    const tab = current.tabs.find((item) => item.noteId === id);
    if (!tab) return "missing";
    if (tab.doc.saving) return "saving";
    if (tab.doc.dirty) {
      set({ tabs: updateTabDoc(current.tabs, id, (doc) => markRemoved(doc, title, parent)) });
      return "marked";
    }
    const result = removeTab(current.tabs, current.activeId, id);
    set(result);
    persist(result.tabs, result.activeId);
    clearClosedPreview(id);
    return "closed";
  },
  retargetTab(oldId, newId, newBase) {
    const current = get();
    if (current.tabs.some((tab) => tab.noteId === newId)) return;
    const tabs = current.tabs.map((tab) => tab.noteId === oldId
      ? { noteId: newId, doc: loadFromDisk(tab.doc, newBase) } : tab);
    const activeId = current.activeId === oldId ? newId : current.activeId;
    set({ tabs, activeId });
    persist(tabs, activeId);
  },
  isDirty(id) {
    return get().tabs.find((tab) => tab.noteId === id)?.doc.dirty ?? false;
  },
  anyDirty() {
    return get().tabs.some((tab) => tab.doc.dirty);
  },
  setBeforeCloseGuard(guard) {
    beforeClose = guard;
    return () => { if (beforeClose === guard) beforeClose = () => true; };
  },
}));

export function resetTabsStoreForTests() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  beforeClose = () => true;
  useTabsStore.setState({ tabs: [], activeId: null, restored: false });
}
