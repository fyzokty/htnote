import type { NoteData } from "@/lib/types";

export type Mode = "view" | "visual" | "code";
export type DocBase = Pick<NoteData, "html" | "css" | "js" | "contentHash">;
export type DocDraft = Pick<DocBase, "html" | "css" | "js">;

export interface DocState {
  focusOnMount?: boolean;
  mode: Mode;
  base: DocBase | null;
  draft: DocDraft | null;
  dirty: boolean;
  visualAvailable: boolean;
  saving: boolean;
  lastSavedAt: number | null;
  baseVersion: number;
  externalConflict: string | null;
  removedOnDisk: boolean;
  removedTitle: string | null;
  removedParent: string;
}

export function createDocState(visualAvailable = true): DocState {
  return {
    mode: "view",
    base: null,
    draft: null,
    dirty: false,
    visualAvailable,
    saving: false,
    lastSavedAt: null,
    baseVersion: 0,
    externalConflict: null,
    removedOnDisk: false,
    removedTitle: null,
    removedParent: "",
  };
}

export function computeDirty(base: DocBase | null, draft: DocDraft | null): boolean {
  if (!base || !draft) return false;
  return draft.html !== base.html || draft.css !== base.css || draft.js !== base.js;
}

function invalid(state: DocState, transition: string): DocState {
  if (import.meta.env.DEV) console.warn(`Invalid document transition: ${transition}`);
  return state;
}

function draftFrom(base: DocBase): DocDraft {
  return { html: base.html, css: base.css, js: base.js };
}

export function enterEdit(state: DocState, base: DocBase, preferred: "visual" | "code" = "visual", visualAvailable = state.visualAvailable): DocState {
  if (state.mode !== "view") return invalid(state, "enterEdit");
  return {
    ...state,
    mode: preferred === "visual" && !visualAvailable ? "code" : preferred,
    visualAvailable,
    base,
    draft: draftFrom(base),
    dirty: false,
    saving: false,
    externalConflict: null,
  };
}

export function switchMode(state: DocState, mode: "visual" | "code", visualAvailable = state.visualAvailable): DocState {
  if (state.mode === "view") return invalid(state, "switchMode");
  return { ...state, visualAvailable, mode: mode === "visual" && !visualAvailable ? "code" : mode };
}

export function updateDraft(state: DocState, partial: Partial<DocDraft>): DocState {
  if (state.mode === "view" || !state.draft || !state.base) return invalid(state, "updateDraft");
  const draft = { ...state.draft, ...partial };
  return { ...state, draft, dirty: computeDirty(state.base, draft) };
}

export function markSaving(state: DocState): DocState {
  if (state.mode === "view" || state.saving) return invalid(state, "markSaving");
  return { ...state, saving: true };
}

export function saveSucceeded(state: DocState, newBase: DocBase, savedAt?: number): DocState {
  if (!state.saving) return invalid(state, "saveSucceeded");
  return {
    ...state,
    base: newBase,
    saving: false,
    lastSavedAt: savedAt ?? Date.now(),
    dirty: computeDirty(newBase, state.draft),
    externalConflict: null,
  };
}

export function saveFailed(state: DocState): DocState {
  if (!state.saving) return invalid(state, "saveFailed");
  return { ...state, saving: false };
}

export function cancelEdit(state: DocState): DocState {
  if (state.mode === "view") return invalid(state, "cancelEdit");
  return { ...state, ...(state.focusOnMount ? { focusOnMount: false } : {}), mode: "view", draft: null, dirty: false, saving: false, externalConflict: null };
}

export function reloadBase(state: DocState, newBase: DocBase): DocState {
  if (state.mode === "view") return { ...state, base: newBase, baseVersion: state.baseVersion + 1, externalConflict: null };
  const draft = state.dirty ? state.draft : draftFrom(newBase);
  return { ...state, base: newBase, draft, dirty: computeDirty(newBase, draft), baseVersion: state.baseVersion + 1, externalConflict: null };
}

export function markConflict(state: DocState, diskHash: string): DocState {
  return { ...state, externalConflict: diskHash };
}

export function keepMine(state: DocState, diskBase: DocBase): DocState {
  if (!state.base || !state.externalConflict) return state;
  return { ...state, base: diskBase, dirty: computeDirty(diskBase, state.draft), externalConflict: null };
}

export function loadFromDisk(state: DocState, base: DocBase): DocState {
  return { ...state, base, draft: state.mode === "view" ? null : draftFrom(base), dirty: false,
    externalConflict: null, removedOnDisk: false, baseVersion: state.baseVersion + 1 };
}

export function markRemoved(state: DocState, title: string | null, parent: string): DocState {
  return { ...state, removedOnDisk: true, externalConflict: null, removedTitle: title, removedParent: parent };
}
