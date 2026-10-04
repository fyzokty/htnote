import { expect, it } from "vitest";
import { fitToolbarGroups } from "./toolbarLayout";

// Measured 32px controls, 2px internal gaps, and 7px group separators/padding.
const widths = [132, 141, 141, 209, 107, 177, 73];

it("keeps all controls at a 1600px window, including separators and card padding", () => {
  expect(fitToolbarGroups(1138, widths)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  const exact = widths.reduce((sum, width) => sum + width, 0) + 6 * 6;
  expect(fitToolbarGroups(exact, widths)).toHaveLength(7);
  expect(fitToolbarGroups(exact - 1, widths)).toEqual([0, 1, 2, 4, 5, 6]);
});

it("overflows table and media first, preserving history and basic formatting last", () => {
  expect(fitToolbarGroups(800, widths)).toEqual([0, 1, 2, 5, 6]);
  expect(fitToolbarGroups(600, widths)).toEqual([0, 1, 2, 6]);
  expect(fitToolbarGroups(300, widths)).toEqual([1, 6]);
  expect(fitToolbarGroups(110, widths)).toEqual([6]);
  expect(fitToolbarGroups(60, widths)).toEqual([]);
  expect(fitToolbarGroups(1138, widths)).toHaveLength(7);
});
