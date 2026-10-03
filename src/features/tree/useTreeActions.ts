import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { resolveCreateTarget } from "@/features/tree/treeNavigation";
import { canDrop } from "@/features/tree/canDrop";
import { notifyError } from "@/lib/errors";
import { ipc } from "@/lib/ipc";
import type { TreeNode } from "@/lib/types";
import { useTreeStore } from "@/stores/treeStore";

export async function renameNoteItem(id: string, name: string): Promise<boolean> {
  try {
    await ipc.renameNote(id, name);
    await useTreeStore.getState().refresh();
    return true;
  } catch (error) {
    notifyError(error);
    return false;
  }
}

export function useTreeActions(onOpenNote?: (id: string) => void) {
  const { t } = useTranslation();
  const createNote = useCallback(async (parent?: string) => {
    const state = useTreeStore.getState();
    try {
      const node = await ipc.createNote(parent ?? resolveCreateTarget(state.selected, state.tree), t("tree.untitledNote"));
      await state.refresh();
      if (node.type === "note") {
        useTreeStore.getState().revealNote(node.id);
        useTreeStore.getState().flashNode(`note:${node.id}`);
        onOpenNote?.(node.id);
      }
    } catch (error) { notifyError(error); }
  }, [onOpenNote, t]);

  const createFolder = useCallback(async (parent?: string) => {
    const state = useTreeStore.getState();
    try {
      const node = await ipc.createFolder(parent ?? resolveCreateTarget(state.selected, state.tree), t("tree.newFolderName"));
      await state.refresh();
      if (node.type === "folder") {
        useTreeStore.getState().revealFolder(node.relPath);
        useTreeStore.getState().setRenaming(node.relPath);
        useTreeStore.getState().flashNode(`folder:${node.relPath}`);
      }
    } catch (error) { notifyError(error); }
  }, [t]);

  const renameNode = useCallback(async (node: TreeNode, name: string) => {
    try {
      if (node.type === "note") {
        await renameNoteItem(node.id, name);
        useTreeStore.getState().flashNode(`note:${node.id}`);
      } else {
        const renamed = await ipc.renameFolder(node.relPath, name);
        if (renamed.type === "folder") {
          useTreeStore.getState().movePathPrefix(node.relPath, renamed.relPath);
          useTreeStore.getState().flashNode(`folder:${renamed.relPath}`);
        }
        await useTreeStore.getState().refresh();
      }
    } catch (error) { notifyError(error); }
    finally { useTreeStore.getState().setRenaming(null); }
  }, []);

  const revealNode = useCallback(async (node: TreeNode) => {
    try { await ipc.revealInExplorer(node.relPath); }
    catch (error) { notifyError(error); }
  }, []);

  const moveNode = useCallback(async (node: TreeNode, targetRelPath: string) => {
    const state = useTreeStore.getState();
    if (!canDrop(node, targetRelPath, state.tree)) return;
    try {
      const newPath = await ipc.moveItem(node.relPath, targetRelPath);
      if (node.type === "folder") useTreeStore.getState().movePathPrefix(node.relPath, newPath);
      await useTreeStore.getState().refresh();
      if (node.type === "folder") {
        useTreeStore.getState().revealFolder(newPath);
        useTreeStore.getState().flashNode(`folder:${newPath}`);
      } else {
        if (targetRelPath) useTreeStore.getState().revealFolder(targetRelPath);
        useTreeStore.getState().revealNote(node.id);
        useTreeStore.getState().select({ kind: "note", id: node.id });
        useTreeStore.getState().flashNode(`note:${node.id}`);
      }
    } catch (error) { notifyError(error); }
  }, []);

  return { createNote, createFolder, renameNode, revealNode, moveNode };
}
