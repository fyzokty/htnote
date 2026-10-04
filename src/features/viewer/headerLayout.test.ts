import { describe, expect, it } from "vitest";
import { fitNoteHeader } from "./headerLayout";

const measurements = { available: 1280, title: 240, path: 100, saved: 220, tags: [70, 100], add: 80, overflow: 32,
  actions: 560, actionSavings: [70, 45, 85, 55, 50] };

describe("fitNoteHeader", () => {
  it("preserves the note title at 1600px and removes saved text first", () => {
    expect(fitNoteHeader(measurements)).toMatchObject({ title: 240, saved: 0, visibleTags: 2, compactLevel: 0 });
    expect(fitNoteHeader({ ...measurements, available: 1500 })).toMatchObject({ saved: 220, visibleTags: 2, title: 240 });
  });
  it("folds tags before secondary action labels and never leaves a one-letter saved text", () => {
    expect(fitNoteHeader({ ...measurements, available: 1050 })).toMatchObject({ path: 24, saved: 0, visibleTags: 1, compactLevel: 0, title: 240 });
  });
  it("folds export, cancel, modes, save shortcut and save label in that order", () => {
    for (const [available, compactLevel] of [[950, 1], [880, 2], [830, 3], [760, 4], [700, 5]]) {
      expect(fitNoteHeader({ ...measurements, available })).toMatchObject({ title: 240, saved: 0, visibleTags: 0, compactLevel });
    }
    expect(fitNoteHeader({ ...measurements, available: 600 })).toMatchObject({ title: 181, compactLevel: 5 });
  });
  it("uses the same priorities in viewing mode and restores content when widened", () => {
    const view = { ...measurements, actions: 260, actionSavings: [70, 0, 0, 55, 50] };
    expect(fitNoteHeader({ ...view, available: 850 })).toMatchObject({ title: 240, saved: 0, compactLevel: 0 });
    expect(fitNoteHeader({ ...view, available: 1400 })).toMatchObject({ title: 240, saved: 220, visibleTags: 2, compactLevel: 0 });
  });
  it("handles absent metadata and short titles without reserving unnecessary space", () => {
    expect(fitNoteHeader({ available: 400, title: 100, path: 0, saved: 0, tags: [], add: 80, overflow: 32 })).toEqual({ title: 100, path: 0, saved: 0, visibleTags: 0, compactLevel: 0 });
  });
  it("keeps two short tags when shortening the breadcrumb provides enough room", () => {
    expect(fitNoteHeader({ available: 600, title: 140, path: 220, saved: 0,
      tags: [64, 64], add: 80, overflow: 32, actions: 180 })).toMatchObject({ visibleTags: 2, title: 140, compactLevel: 0 });
  });
  it("preserves every tag at the exact measured width including all gaps", () => {
    expect(fitNoteHeader({ available: 600, title: 140, path: 120, saved: 0,
      tags: [64, 64], add: 80, overflow: 32, actions: 100 })).toMatchObject({ visibleTags: 2, path: 120, title: 140 });
  });

});
