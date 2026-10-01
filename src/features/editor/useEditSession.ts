import { useEffect, useRef } from "react";

import { extractContent, replaceContent } from "@/features/editor/contentRegion";
import type { VisualEditorHandle } from "@/features/editor/VisualEditor";
import { flushEditor, registerEditorFlush, saveTab } from "@/features/editor/saveTab";
import { discardTab, requestUnsavedDecision } from "@/features/editor/unsavedGuard";
import { ipc } from "@/lib/ipc";
import { useTabsStore } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";

export function useEditSession(noteId: string | null) {
  const visualRef = useRef<VisualEditorHandle>(null);
  useEffect(() => noteId ? registerEditorFlush(noteId, () => visualRef.current?.flush()) : undefined, [noteId]);
  const getDoc = () => useTabsStore.getState().tabs.find((tab) => tab.noteId === noteId)?.doc;
  const notifyError = (error: unknown) => {
    const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code : "UNKNOWN";
    useUiStore.getState().pushToast({ kind: "error", messageKey: code === "CONFLICT" ? "editor.session.conflict" : `errors.${code}` });
  };
  const clearPreview = () => { if (noteId) void ipc.clearPreviewDraft(noteId).catch(notifyError); };

  async function enter() {
    if (!noteId || getDoc()?.mode !== "view") return;
    try {
      const base = await ipc.readNote(noteId);
      if (getDoc()?.mode !== "view") return;
      useTabsStore.getState().enterEdit(noteId, base, "visual", extractContent(base.html).ok);
    } catch (error) { notifyError(error); }
  }

  function onVisualChange(inner: string) {
    const doc = getDoc();
    if (!noteId || doc?.mode !== "visual" || !doc.draft) return;
    const parts = extractContent(doc.draft.html);
    if (parts.ok && inner !== parts.inner) {
      useTabsStore.getState().updateDraft(noteId, { html: replaceContent(parts, inner) });
    }
  }

  function onCodeChange(partial: { html?: string; css?: string; js?: string }) {
    if (noteId && getDoc()?.mode === "code") useTabsStore.getState().updateDraft(noteId, partial);
  }

  function switchMode(mode: "visual" | "code") {
    if (!noteId || getDoc()?.mode === "view") return;
    if (getDoc()?.mode === "visual") visualRef.current?.flush();
    const doc = getDoc();
    if (mode === "visual" && doc?.draft && !extractContent(doc.draft.html).ok) {
      useUiStore.getState().pushToast({ kind: "error", messageKey: "editor.session.visualUnavailable" });
      return;
    }
    useTabsStore.getState().switchMode(noteId, mode, mode === "visual" ? true : undefined);
  }

  async function save(stayInEdit = false): Promise<boolean> {
    if (!noteId || getDoc()?.mode === "view" || getDoc()?.saving) return false;
    const saved = await saveTab(noteId);
    if (saved && !stayInEdit && !getDoc()?.dirty) {
      useTabsStore.getState().cancelEdit(noteId);
      clearPreview();
    }
    return saved;
  }

  async function cancel(): Promise<boolean> {
    const doc = getDoc();
    if (!noteId || !doc || doc.mode === "view" || doc.saving) return false;
    flushEditor(noteId);
    if (getDoc()?.dirty) {
      const decision = await requestUnsavedDecision([noteId]);
      if (decision === "cancel") return false;
      if (decision === "save") {
        const saved = await saveTab(noteId);
        if (!saved || getDoc()?.dirty) return false;
        useTabsStore.getState().cancelEdit(noteId);
        clearPreview();
        return true;
      }
    }
    return discardTab(noteId);
  }

  async function toggleEdit() {
    const doc = getDoc();
    if (!doc || doc.saving) return;
    if (doc.mode === "view") { await enter(); return; }
    flushEditor(noteId!);
    if (!getDoc()?.dirty) {
      useTabsStore.getState().cancelEdit(noteId!);
      clearPreview();
    } else {
      const decision = await requestUnsavedDecision([noteId!]);
      if (decision === "save" && await saveTab(noteId!) && !getDoc()?.dirty) {
        useTabsStore.getState().cancelEdit(noteId!);
        clearPreview();
      } else if (decision === "discard") {
        await discardTab(noteId!);
      }
    }
  }

  return { visualRef, enter, switchMode, onVisualChange, onCodeChange, save, cancel, toggleEdit };
}
