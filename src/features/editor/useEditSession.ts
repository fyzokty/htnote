import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { extractContent, replaceContent } from "@/features/editor/contentRegion";
import type { VisualEditorHandle } from "@/features/editor/VisualEditor";
import { ipc } from "@/lib/ipc";
import { useTabsStore } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";

export function useEditSession(noteId: string | null) {
  const { t } = useTranslation();
  const visualRef = useRef<VisualEditorHandle>(null);
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
    visualRef.current?.flush();
    const doc = getDoc();
    if (!doc?.base || !doc.draft) return false;
    const snapshot = { ...doc.draft };
    useTabsStore.getState().markSaving(noteId);
    try {
      const result = await ipc.saveNote(noteId, {
        html: snapshot.html, css: snapshot.css ?? "", js: snapshot.js ?? "", expectedHash: doc.base.contentHash,
      });
      useTabsStore.getState().saveSucceeded(noteId, { ...snapshot, contentHash: result.contentHash });
      if (!stayInEdit && !getDoc()?.dirty) {
        useTabsStore.getState().cancelEdit(noteId);
        clearPreview();
      }
      return true;
    } catch (error) {
      useTabsStore.getState().saveFailed(noteId);
      notifyError(error);
      return false;
    }
  }

  function cancel(): boolean {
    const doc = getDoc();
    if (!noteId || !doc || doc.mode === "view" || doc.saving) return false;
    visualRef.current?.flush();
    if (getDoc()?.dirty && !window.confirm(t("editor.session.discardConfirm"))) return false;
    useTabsStore.getState().cancelEdit(noteId);
    clearPreview();
    return true;
  }

  async function toggleEdit() {
    const doc = getDoc();
    if (!doc || doc.saving) return;
    if (doc.mode === "view") { await enter(); return; }
    visualRef.current?.flush();
    if (!getDoc()?.dirty) {
      useTabsStore.getState().cancelEdit(noteId!);
      clearPreview();
    } else {
      // T409 ortak diyaloğu gelene kadar onay, değişiklikleri atıp çıkmayı seçtirir.
      cancel();
    }
  }

  return { visualRef, enter, switchMode, onVisualChange, onCodeChange, save, cancel, toggleEdit };
}
