import { create } from "zustand";

import { ipc } from "@/lib/ipc";
import type { FlatNote, NoteNode, TreeNode, TreeSelection } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";

interface TreeState {
  tree: TreeNode[];
  loading: boolean;
  selected: TreeSelection | null;
  expanded: Set<string>;
  filterQuery: string;
  filterExpandedOverride: Set<string>;
  setFilterQuery: (query: string) => void;
  renamingRelPath: string | null;
  setRenaming: (relPath: string | null) => void;
  revealFolder: (relPath: string) => void;
  movePathPrefix: (oldPath: string, newPath: string) => void;
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
let inFlight: Promise<void> | null = null;
let pendingRefresh: Promise<void> | null = null;

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

function seedExpansion(saved: string[], current: Set<string>, folders: Set<string>) {
  const validSaved = new Set(saved.filter((path) => folders.has(path)));
  const expanded = new Set([...validSaved, ...current].filter((path) => folders.has(path)));
  seeded = true;
  if (saved.length !== validSaved.size || validSaved.size !== expanded.size) persist(expanded);
  return expanded;
}

function reconcile(tree: TreeNode[], expanded: Set<string>, selected: TreeSelection | null) {
  const folders = new Set<string>();
  walk(tree, (node) => { if (node.type === "folder") folders.add(node.relPath); });
  const pruned = new Set([...expanded].filter((path) => folders.has(path)));
  const exists = selected && (selected.kind === "folder"
    ? folders.has(selected.relPath)
    : treeContainsNote(tree, selected.id));
  return { folders, expanded: pruned, selected: exists ? selected : null };
}

export const useTreeStore = create<TreeState>((set, get) => ({
  tree: [],
  loading: false,
  selected: null,
  expanded: new Set<string>(),
  filterQuery: "",
  filterExpandedOverride: new Set<string>(),
  setFilterQuery(filterQuery) { set({ filterQuery, filterExpandedOverride: filterQuery.trim() ? get().filterExpandedOverride : new Set<string>() }); },
  renamingRelPath: null,
  setRenaming(renamingRelPath) { set({ renamingRelPath }); },
  revealFolder(relPath) {
    const parts = relPath.split("/");
    const expanded = new Set(get().expanded);
    for (let index = 1; index < parts.length; index++) expanded.add(parts.slice(0, index).join("/"));
    set({ expanded, selected: { kind: "folder", relPath } });
    persist(expanded);
  },
  movePathPrefix(oldPath, newPath) {
    const move = (path: string) => path === oldPath ? newPath : path.startsWith(`${oldPath}/`) ? `${newPath}${path.slice(oldPath.length)}` : path;
    const expanded = new Set([...get().expanded].map(move));
    const selected = get().selected;
    set({ expanded, selected: selected?.kind === "folder" ? { kind: "folder", relPath: move(selected.relPath) } : selected });
    persist(expanded);
  },
  load() {
    if (inFlight) return inFlight;
    set({ loading: true });
    inFlight = (async () => {
      try {
        const tree = await ipc.getNoteTree();
        const current = reconcile(tree, get().expanded, get().selected);
        const saved = useSettingsStore.getState().settings?.expandedFolders;
        const expanded = !seeded && saved
          ? seedExpansion(saved, current.expanded, current.folders)
          : current.expanded;
        loaded = true;
        set({ tree, expanded, selected: current.selected, loading: false });
      } catch (error) {
        set({ loading: false });
        throw error;
      }
    })().finally(() => { inFlight = null; });
    return inFlight;
  },
  refresh() {
    if (inFlight) {
      if (!pendingRefresh) {
        pendingRefresh = inFlight.catch(() => {}).then(() => get().refresh()).finally(() => {
          pendingRefresh = null;
        });
      }
      return pendingRefresh;
    }
    set({ loading: true });
    inFlight = (async () => {
      try {
        const tree = await ipc.getNoteTree();
        const before = get().expanded;
        const current = reconcile(tree, before, get().selected);
        const saved = useSettingsStore.getState().settings?.expandedFolders;
        const expanded = !seeded && saved
          ? seedExpansion(saved, current.expanded, current.folders)
          : current.expanded;
        loaded = true;
        set({ tree, expanded, selected: current.selected, loading: false });
        if (before.size !== expanded.size && seeded) persist(expanded);
      } catch (error) {
        set({ loading: false });
        throw error;
      }
    })().finally(() => { inFlight = null; });
    return inFlight;
  },
  toggle(relPath) {
    if (get().filterQuery.trim()) {
      const override = new Set(get().filterExpandedOverride);
      if (override.has(relPath)) override.delete(relPath);
      else override.add(relPath);
      set({ filterExpandedOverride: override });
      return;
    }
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
  useTreeStore.setState({ expanded: seedExpansion(state.settings.expandedFolders, useTreeStore.getState().expanded, folders) });
});

export function resetTreeStoreForTests() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  seeded = false;
  loaded = false;
  inFlight = null;
  pendingRefresh = null;
  useTreeStore.setState({ tree: [], loading: false, selected: null, expanded: new Set<string>(), filterQuery: "", filterExpandedOverride: new Set<string>(), renamingRelPath: null });
}
