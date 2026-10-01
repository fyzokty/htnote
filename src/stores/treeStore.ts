import { create } from "zustand";

import { ipc } from "@/lib/ipc";
import type { FlatNote, NoteNode, TreeNode, TreeSelection } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";

interface TreeState {
  tree: TreeNode[];
  loading: boolean;
  selected: TreeSelection | null;
  expanded: Set<string>;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  toggle: (relPath: string) => void;
  select: (selection: TreeSelection | null) => void;
  revealNote: (id: string) => void;
  findNoteById: (id: string) => NoteNode | null;
  flatNotes: () => FlatNote[];
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let seeded = false;
let loaded = false;
let pendingChanges: Array<{ kind: "toggle" | "reveal"; paths: string[] }> = [];

function walk(nodes: TreeNode[], visit: (node: TreeNode, parents: string[]) => void, parents: string[] = []) {
  for (const node of nodes) {
    visit(node, parents);
    if (node.type === "folder") walk(node.children, visit, [...parents, node.relPath]);
  }
}

function persist(expanded: Set<string>) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (seeded && useSettingsStore.getState().settings) {
      void useSettingsStore.getState().update({ expandedFolders: [...expanded] }).catch(() => {});
    }
  }, 500);
}

function seedExpansion(saved: string[], folders: Set<string>) {
  const expanded = new Set(saved.filter((path) => folders.has(path)));
  for (const change of pendingChanges) {
    for (const path of change.paths) {
      if (!folders.has(path)) continue;
      if (change.kind === "reveal") expanded.add(path);
      else if (expanded.has(path)) expanded.delete(path);
      else expanded.add(path);
    }
  }
  const changed = pendingChanges.length > 0;
  pendingChanges = [];
  seeded = true;
  if (changed) persist(expanded);
  return expanded;
}

export const useTreeStore = create<TreeState>((set, get) => ({
  tree: [],
  loading: false,
  selected: null,
  expanded: new Set<string>(),
  async load() {
    if (get().loading) return;
    set({ loading: true });
    try {
      const tree = await ipc.getNoteTree();
      const folders = new Set<string>();
      walk(tree, (node) => { if (node.type === "folder") folders.add(node.relPath); });
      const saved = useSettingsStore.getState().settings?.expandedFolders;
      const expanded = !seeded && saved
        ? seedExpansion(saved, folders)
        : new Set([...get().expanded].filter((path) => folders.has(path)));
      loaded = true;
      const selected = get().selected;
      const exists = selected && (selected.kind === "folder"
        ? folders.has(selected.relPath)
        : treeContainsNote(tree, selected.id));
      set({ tree, expanded, selected: exists ? selected : null, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  async refresh() {
    const before = get().expanded;
    await get().load();
    const after = get().expanded;
    if (before.size !== after.size || [...before].some((path) => !after.has(path))) persist(after);
  },
  toggle(relPath) {
    if (!seeded) pendingChanges.push({ kind: "toggle", paths: [relPath] });
    const expanded = new Set(get().expanded);
    if (expanded.has(relPath)) expanded.delete(relPath);
    else expanded.add(relPath);
    set({ expanded });
    persist(expanded);
  },
  select(selected) { set({ selected }); },
  revealNote(id) {
    let parents: string[] | null = null;
    walk(get().tree, (node, ancestors) => {
      if (node.type === "note" && node.id === id) parents = ancestors;
    });
    if (!parents) return;
    if (!seeded) pendingChanges.push({ kind: "reveal", paths: parents });
    const previous = get().expanded;
    const expanded = new Set([...get().expanded, ...parents]);
    set({ expanded, selected: { kind: "note", id } });
    if (expanded.size !== previous.size) persist(expanded);
  },
  findNoteById(id) {
    let found: NoteNode | null = null;
    walk(get().tree, (node) => { if (node.type === "note" && node.id === id) found = node; });
    return found;
  },
  flatNotes() {
    const notes: FlatNote[] = [];
    walk(get().tree, (node) => {
      if (node.type === "note") notes.push({ id: node.id, title: node.title, relPath: node.relPath });
    });
    return notes;
  },
}));

function treeContainsNote(tree: TreeNode[], id: string) {
  let found = false;
  walk(tree, (node) => { if (node.type === "note" && node.id === id) found = true; });
  return found;
}

// İlk yükleme ayarlardan önce gerçekleşirse genişletme ayarlar geldiğinde uygulanır.
useSettingsStore.subscribe((state) => {
  if (seeded || !loaded || !state.settings) return;
  const folders = new Set<string>();
  walk(useTreeStore.getState().tree, (node) => { if (node.type === "folder") folders.add(node.relPath); });
  useTreeStore.setState({ expanded: seedExpansion(state.settings.expandedFolders, folders) });
});

export function resetTreeStoreForTests() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  seeded = false;
  loaded = false;
  pendingChanges = [];
  useTreeStore.setState({ tree: [], loading: false, selected: null, expanded: new Set<string>() });
}
