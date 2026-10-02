import { notifyError } from "@/lib/errors";
import { ipc } from "@/lib/ipc";
import type { NoteNode, TreeNode } from "@/lib/types";
import { useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";

export function deriveFavorites(tree: TreeNode[]): NoteNode[] {
  const favorites: NoteNode[] = [];
  const visit = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.type === "folder") visit(node.children);
      else if (node.isFavorite) favorites.push(node);
    }
  };
  visit(tree);
  return favorites.sort((a, b) => a.title.localeCompare(b.title, "tr"));
}

export async function toggleFavorite(id: string, value: boolean): Promise<void> {
  const before = useTreeStore.getState().findNoteById(id);
  if (!before || before.isFavorite === value) return;
  useTreeStore.getState().patchNote(id, { isFavorite: value });
  try {
    const result = await ipc.updateMetadata(id, { isFavorite: value });
    useTreeStore.getState().patchNote(id, { isFavorite: result.metadata.isFavorite, tags: result.metadata.tags });
    useTabsStore.getState().applyMetadataUpdate(id, result.metadata, result.contentHash);
  } catch (error) {
    useTreeStore.getState().patchNote(id, { isFavorite: before.isFavorite });
    notifyError(error);
  }
}
