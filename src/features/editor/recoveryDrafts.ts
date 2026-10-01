import { useEffect } from "react";

import { ipc } from "@/lib/ipc";
import type { NoteNode, RecoveryDraft, TreeNode } from "@/lib/types";
import { useTabsStore } from "@/stores/tabsStore";

export const ORPHAN_TTL = 30 * 24 * 60 * 60 * 1000;

export function selectRecoveryCandidates(drafts: RecoveryDraft[], index: TreeNode[], now: number) {
  const notes = new Map<string, NoteNode>();
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.type === "note") notes.set(node.id, node);
      else walk(node.children);
    }
  };
  walk(index);
  const candidates: { draft: RecoveryDraft; note: NoteNode }[] = [];
  const toDelete: string[] = [];
  for (const draft of drafts) {
    const note = notes.get(draft.id);
    const savedAt = Date.parse(draft.savedAt);
    if (!Number.isFinite(savedAt)) continue;
    if (note) {
      const updatedAt = Date.parse(note.updatedAt);
      if (!Number.isFinite(updatedAt)) continue;
      if (savedAt > updatedAt) candidates.push({ draft, note });
      else toDelete.push(draft.id);
    } else if (now - savedAt > ORPHAN_TTL) {
      toDelete.push(draft.id);
    }
  }
  return { candidates, toDelete };
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const writes = new Map<string, Promise<void>>();

function cancelTimer(id: string) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
}

function schedule(id: string) {
  cancelTimer(id);
  const doc = useTabsStore.getState().tabs.find((tab) => tab.noteId === id)?.doc;
  if (!doc?.dirty || !doc.draft || !doc.base) return;
  timers.set(id, setTimeout(() => {
    timers.delete(id);
    const current = useTabsStore.getState().tabs.find((tab) => tab.noteId === id)?.doc;
    if (!current?.dirty || !current.draft || !current.base) return;
    const payload = {
      html: current.draft.html,
      css: current.draft.css ?? "",
      js: current.draft.js ?? "",
      baseHash: current.base.contentHash,
      savedAt: new Date().toISOString(),
    };
    const previous = writes.get(id) ?? Promise.resolve();
    const write = previous.then(() => ipc.writeDraft(id, payload)).catch((error: unknown) => {
      console.warn("Could not save recovery draft", id, error);
    });
    writes.set(id, write);
    void write.finally(() => { if (writes.get(id) === write) writes.delete(id); });
  }, 5000));
}

export async function deleteRecoveryDraft(id: string) {
  cancelTimer(id);
  await writes.get(id);
  try {
    await ipc.deleteDraft(id);
  } catch (error) {
    console.warn("Could not delete recovery draft", id, error);
  }
}

export function useDraftAutosave() {
  useEffect(() => {
    const unsubscribe = useTabsStore.subscribe((state, previous) => {
      const old = new Map(previous.tabs.map((tab) => [tab.noteId, tab.doc]));
      for (const tab of state.tabs) {
        const before = old.get(tab.noteId);
        if (tab.doc.draft !== before?.draft || tab.doc.dirty !== before?.dirty || tab.doc.base !== before?.base) schedule(tab.noteId);
        old.delete(tab.noteId);
      }
      for (const id of old.keys()) cancelTimer(id);
    });
    return () => {
      unsubscribe();
      for (const id of timers.keys()) cancelTimer(id);
    };
  }, []);
}
