import { describe, expect, it } from "vitest";
import { fitNoteHeader } from "./headerLayout";

const measurements = { available: 800, title: 180, path: 120, saved: 200, tags: [70, 100], add: 80, overflow: 32 };

describe("fitNoteHeader", () => {
  it("shows full content when it fits, including tags of different widths", () => {
    expect(fitNoteHeader(measurements)).toEqual({ path: 120, saved: 200, visibleTags: 2 });
  });
  it("shortens only the folder path for a small shortage", () => {
    expect(fitNoteHeader({ ...measurements, available: 750 })).toEqual({ path: 88, saved: 200, visibleTags: 2 });
  });
  it("shortens saved time only after the folder path", () => {
    expect(fitNoteHeader({ ...measurements, available: 650 })).toEqual({ path: 24, saved: 164, visibleTags: 2 });
  });
  it("folds tags last and reserves space for the overflow button", () => {
    expect(fitNoteHeader({ ...measurements, available: 470 })).toEqual({ path: 24, saved: 36, visibleTags: 1 });
    expect(fitNoteHeader({ ...measurements, available: 350 })).toEqual({ path: 24, saved: 36, visibleTags: 0 });
  });
  it("restores all content when widened and handles missing metadata", () => {
    expect(fitNoteHeader({ ...measurements, available: 900 }).visibleTags).toBe(2);
    expect(fitNoteHeader({ ...measurements, available: 400, path: 0, saved: 0, tags: [] })).toEqual({ path: 0, saved: 0, visibleTags: 0 });
  });
});
