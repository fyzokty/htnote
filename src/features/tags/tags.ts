import { notifyError } from "@/lib/errors";
import { ipc } from "@/lib/ipc";
import { normalizeText } from "@/lib/textMatch";
import type { TreeNode } from "@/lib/types";
import { useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";

export interface TagCount { tag: string; count: number }

export function deriveTags(tree: TreeNode[]): TagCount[] {
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  const visit = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.type === "folder") { visit(node.children); continue; }
      const seen = new Set<string>();
      for (const tag of node.tags) {
        const key = normalizeText(tag);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const group = groups.get(key) ?? { count: 0, spellings: new Map<string, number>() };
        group.count++;
        group.spellings.set(tag, (group.spellings.get(tag) ?? 0) + 1);
        groups.set(key, group);
      }
    }
  };
  visit(tree);
  return [...groups.values()].map(({ count, spellings }) => {
    let tag = "";
    let mostUses = 0;
    for (const [spelling, uses] of spellings) {
      if (uses > mostUses) { tag = spelling; mostUses = uses; }
    }
    return { tag, count };
  }).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "tr"));
}

export function addTag(tags: string[], value: string): string[] {
  const tag = value.trim();
  return !tag || tags.some((item) => normalizeText(item) === normalizeText(tag)) ? tags : [...tags, tag];
}

export function removeTag(tags: string[], value: string): string[] {
  return tags.filter((tag) => normalizeText(tag) !== normalizeText(value));
}

interface PendingUpdate { sequence: number; queue: Promise<void>; persisted: string[]; desired: string[] }
const pending = new Map<string, PendingUpdate>();

export function setNoteTags(id: string, tags: string[]): Promise<void> {
  const before = useTreeStore.getState().findNoteById(id);
  if (!before || (before.tags.length === tags.length && before.tags.every((tag, index) => tag === tags[index]))) return Promise.resolve();
  let state = pending.get(id);
  if (!state) {
    state = { sequence: 0, queue: Promise.resolve(), persisted: before.tags, desired: tags };
    pending.set(id, state);
  }
  const current = state;
  const sequence = ++current.sequence;
  current.desired = tags;
  useTreeStore.getState().patchNote(id, { tags });
  // Disk yazımlarını sıralamak son kullanıcı değişikliğinin son yazım olmasını sağlar.
  const update = current.queue.then(async () => {
    if (sequence !== current.sequence) return;
    try {
      const result = await ipc.updateMetadata(id, { tags: current.desired });
      current.persisted = result.metadata.tags;
      useTabsStore.getState().applyMetadataUpdate(id, result.metadata, result.contentHash);
      if (sequence === current.sequence) useTreeStore.getState().patchNote(id, { tags: result.metadata.tags });
    } catch (error) {
      if (sequence === current.sequence) {
        useTreeStore.getState().patchNote(id, { tags: current.persisted });
        notifyError(error);
      }
    }
  });
  current.queue = update;
  void update.finally(() => { if (pending.get(id) === current && current.sequence === sequence) pending.delete(id); });
  return update;
}
