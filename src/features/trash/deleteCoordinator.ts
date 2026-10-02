import { resolveUnsaved } from "@/features/editor/unsavedGuard";
import { notifyError } from "@/lib/errors";
import { ipc } from "@/lib/ipc";
import type { TreeNode } from "@/lib/types";
import { useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

function noteIds(node: TreeNode): string[] {
  return node.type === "note" ? [node.id] : node.children.flatMap(noteIds);
}

export async function refreshTrashCount() {
  const items = await ipc.listTrash();
  useUiStore.getState().setTrashCount(items.length);
  return items;
}

export async function restoreAndReveal(trashId: string) {
  try {
    const restoredPath = await ipc.restoreFromTrash(trashId);
    await useTreeStore.getState().refresh();
    const note = useTreeStore.getState().flatNotes().find((item) => item.relPath === restoredPath);
    if (note) useTreeStore.getState().revealNote(note.id);
    await refreshTrashCount();
  } catch (error) { notifyError(error); }
}

export async function deleteTreeItem(node: TreeNode) {
  const ids = noteIds(node);
  if (node.type === "folder" && !await useUiStore.getState().confirm("trash.folderTitle", "trash.folderMessage", { count: ids.length, name: node.name })) return;
  const affected = useTabsStore.getState().tabs.filter((tab) => ids.includes(tab.noteId)).map((tab) => tab.noteId);
  try {
    const resolution = await resolveUnsaved(affected);
    if (resolution.cancelled || affected.some((id) => !resolution.resolved.has(id) || useTabsStore.getState().isDirty(id))) return;
    for (const id of affected) {
      if (!await useTabsStore.getState().close(id)) return;
    }
    const item = await ipc.deleteItem(node.relPath);
    useUiStore.getState().pushToast({
      kind: "success", messageKey: "trash.moved",
      action: { labelKey: "trash.undo", onClick: () => { void restoreAndReveal(item.trashId); } },
    });
    await useTreeStore.getState().refresh();
    await refreshTrashCount();
  } catch (error) { notifyError(error); }
}
