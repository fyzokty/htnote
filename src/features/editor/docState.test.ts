import { describe, expect, it, vi } from "vitest";

import {
  cancelEdit, computeDirty, createDocState, enterEdit, markSaving, reloadBase,
  saveFailed, saveSucceeded, switchMode, updateDraft,
} from "@/features/editor/docState";
import type { DocBase } from "@/features/editor/docState";

const base: DocBase = { html: "<p>Hello</p>", css: null, js: "", contentHash: "one" };
const changed: DocBase = { html: "<p>Changed</p>", css: null, js: "", contentHash: "two" };

describe("docState", () => {
  it("starts in view mode with no draft", () => {
    expect(createDocState()).toEqual({
      mode: "view", base: null, draft: null, dirty: false,
      visualAvailable: true, saving: false, lastSavedAt: null,
    });
  });

  it.each([
    [true, "visual", "visual"],
    [true, "code", "code"],
    [false, "visual", "code"],
    [false, "code", "code"],
  ] as const)("enters edit with availability %s and preference %s", (available, preferred, expected) => {
    const state = enterEdit(createDocState(available), base, preferred);
    expect(state).toMatchObject({ mode: expected, base, draft: { html: base.html, css: base.css, js: base.js }, dirty: false });
    expect(state.draft).not.toBe(base);
  });

  it("switches modes without changing the draft and falls back to code", () => {
    const edited = updateDraft(enterEdit(createDocState(), base), { html: "new" });
    const code = switchMode(edited, "code");
    const visual = switchMode(code, "visual");
    expect(code.draft).toBe(edited.draft);
    expect(visual.draft).toBe(edited.draft);
    expect(visual.dirty).toBe(true);
    expect(switchMode(enterEdit(createDocState(false), base), "visual").mode).toBe("code");
  });

  it.each([
    [{ html: base.html }, false],
    [{ html: `${base.html} ` }, true],
    [{ css: "" }, true],
    [{ js: null }, true],
    [{ html: "changed" }, true],
  ] as const)("calculates dirty strictly for %j", (partial, dirty) => {
    const state = updateDraft(enterEdit(createDocState(), base), partial);
    expect(state.dirty).toBe(dirty);
    expect(computeDirty(base, state.draft)).toBe(dirty);
    expect(updateDraft(state, { html: base.html, css: base.css, js: base.js }).dirty).toBe(false);
  });

  it("marks saving, preserves edits on failure, and cancels edit", () => {
    const edited = updateDraft(enterEdit(createDocState(), base), { html: "new" });
    const saving = markSaving(edited);
    expect(saving.saving).toBe(true);
    const failed = saveFailed(saving);
    expect(failed).toMatchObject({ draft: edited.draft, dirty: true, saving: false });
    expect(cancelEdit(failed)).toMatchObject({ mode: "view", draft: null, dirty: false, saving: false });
  });

  it("recalculates dirty from the current draft after saving", () => {
    const saving = markSaving(updateDraft(enterEdit(createDocState(), base), { html: changed.html }));
    const whileSaving = updateDraft(saving, { html: "later" });
    const saved = saveSucceeded(whileSaving, changed, 123);
    expect(saved).toMatchObject({ mode: "visual", base: changed, draft: whileSaving.draft, dirty: true, saving: false, lastSavedAt: 123 });
    expect(saveSucceeded(saving, changed, 124).dirty).toBe(false);
  });

  it("uses the current time when a save timestamp is omitted", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000);
      const saving = markSaving(enterEdit(createDocState(), base));
      expect(saveSucceeded(saving, base).lastSavedAt).toBe(1000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reloads a clean draft and preserves a dirty draft", () => {
    expect(reloadBase(createDocState(), changed)).toMatchObject({ mode: "view", base: changed, draft: null });
    const clean = enterEdit(createDocState(), base);
    expect(reloadBase(clean, changed)).toMatchObject({ base: changed, draft: { html: changed.html, css: changed.css, js: changed.js }, dirty: false });
    const dirty = updateDraft(clean, { html: changed.html });
    const reloaded = reloadBase(dirty, changed);
    expect(reloaded.draft).toBe(dirty.draft);
    expect(reloaded.dirty).toBe(false);
    expect(reloadBase(dirty, { ...changed, html: "other" }).dirty).toBe(true);
  });

  it.each([
    ["enterEdit while editing", () => enterEdit(createDocState(), base), (state: ReturnType<typeof createDocState>) => enterEdit(state, changed)],
    ["switchMode in view", createDocState, (state: ReturnType<typeof createDocState>) => switchMode(state, "code")],
    ["updateDraft in view", createDocState, (state: ReturnType<typeof createDocState>) => updateDraft(state, { html: "new" })],
    ["markSaving in view", createDocState, markSaving],
    ["markSaving twice", () => markSaving(enterEdit(createDocState(), base)), markSaving],
    ["saveSucceeded without saving", () => enterEdit(createDocState(), base), (state: ReturnType<typeof createDocState>) => saveSucceeded(state, changed)],
    ["saveFailed without saving", () => enterEdit(createDocState(), base), saveFailed],
    ["cancelEdit in view", createDocState, cancelEdit],
  ] as const)("leaves state unchanged for %s", (_name, setup, transition) => {
    const state = setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(transition(state)).toBe(state);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
