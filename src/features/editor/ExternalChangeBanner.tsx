import { useState } from "react";
import { useTranslation } from "react-i18next";

import { deleteRecoveryDraft } from "@/features/editor/recoveryDrafts";
import { notifySaveError } from "@/features/editor/saveTab";
import { ipc } from "@/lib/ipc";
import type { TreeNode } from "@/lib/types";
import { useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";
import type { DocState } from "@/features/editor/docState";

function hasFolder(nodes: TreeNode[], path: string): boolean {
  return nodes.some((node) => node.type === "folder" && (node.relPath === path || hasFolder(node.children, path)));
}

export function ExternalChangeBanner({ noteId, doc }: { noteId: string; doc: DocState }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  if (!doc.externalConflict && !doc.removedOnDisk) return null;

  async function loadDisk() {
    setBusy(true);
    try {
      const disk = await ipc.readNote(noteId);
      await ipc.clearPreviewDraft(noteId);
      await deleteRecoveryDraft(noteId);
      useTabsStore.getState().loadFromDisk(noteId, disk);
    } catch (error) { notifySaveError(error); }
    finally { setBusy(false); }
  }

  async function keepDraft() {
    setBusy(true);
    try {
      const disk = await ipc.readNote(noteId);
      useTabsStore.getState().markConflict(noteId, disk.contentHash);
      useTabsStore.getState().keepMine(noteId);
    } catch (error) { notifySaveError(error); }
    finally { setBusy(false); }
  }

  async function saveAs() {
    const draft = useTabsStore.getState().tabs.find((tab) => tab.noteId === noteId)?.doc.draft;
    if (!draft) return;
    setBusy(true);
    try {
      const parent = doc.removedParent;
      const folderExists = !parent || hasFolder(useTreeStore.getState().tree, parent);
      const title = doc.removedTitle ?? t("tree.untitledNote");
      let created;
      try {
        created = await ipc.createNote(folderExists ? parent : "", title);
      } catch (error) {
        if (!parent || !folderExists || typeof error !== "object" || error === null || !("code" in error)
          || !["NOT_A_FOLDER", "PATH_OUTSIDE_ROOT", "NOTE_NOT_FOUND"].includes(String(error.code))) throw error;
        created = await ipc.createNote("", title);
      }
      if (created.type !== "note") return;
      const blank = await ipc.readNote(created.id);
      const result = await ipc.saveNote(created.id, {
        html: draft.html, css: draft.css ?? "", js: draft.js ?? "", expectedHash: blank.contentHash,
      });
      await ipc.clearPreviewDraft(noteId);
      await deleteRecoveryDraft(noteId);
      useTabsStore.getState().retargetTab(noteId, created.id, { ...draft, contentHash: result.contentHash });
      await useTreeStore.getState().refresh();
    } catch (error) { notifySaveError(error); }
    finally { setBusy(false); }
  }

  return (
    <div role="alert" className="flex shrink-0 items-center gap-3 border-b border-app-border bg-app-subtle px-4 py-2 text-sm">
      <span>{doc.removedOnDisk ? t("external.removed") : t("external.changed")}</span>
      {doc.removedOnDisk
        ? <button type="button" disabled={busy} onClick={() => { void saveAs(); }}>{t("external.saveAs")}</button>
        : <>
          <button type="button" disabled={busy} onClick={() => { void loadDisk(); }}>{t("external.loadDisk")}</button>
          <button type="button" disabled={busy} onClick={() => { void keepDraft(); }}>{t("external.keepMine")}</button>
        </>}
    </div>
  );
}
