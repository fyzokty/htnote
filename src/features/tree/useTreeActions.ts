import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { resolveCreateTarget } from "@/features/tree/treeNavigation";
import { notifyError } from "@/lib/errors";
import { ipc } from "@/lib/ipc";
import type { TreeNode } from "@/lib/types";
import { useTreeStore } from "@/stores/treeStore";

export function useTreeActions(onOpenNote: (id: string) => void) {
  const { t } = useTranslation();
  const createNote = useCallback(async (parent?: string) => {
    const state = useTreeStore.getState();
    try {
      const node = await ipc.createNote(parent ?? resolveCreateTarget(state.selected, state.tree), t("tree.untitledNote"));
      await state.refresh();
      if (node.type === "note") {
        useTreeStore.getState().revealNote(node.id);
        onOpenNote(node.id);
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
      }
    } catch (error) { notifyError(error); }
  }, [t]);

  const renameNode = useCallback(async (node: TreeNode, name: string) => {
    try {
      if (node.type === "note") {
        await ipc.renameNote(node.id, name);
      } else {
        const renamed = await ipc.renameFolder(node.relPath, name);
        if (renamed.type === "folder") useTreeStore.getState().movePathPrefix(node.relPath, renamed.relPath);
      }
      await useTreeStore.getState().refresh();
    } catch (error) { notifyError(error); }
    finally { useTreeStore.getState().setRenaming(null); }
  }, []);

  const revealNode = useCallback(async (node: TreeNode) => {
    try { await ipc.revealInExplorer(node.relPath); }
    catch (error) { notifyError(error); }
  }, []);

  return { createNote, createFolder, renameNode, revealNode };
}
