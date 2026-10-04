import { expect, it } from "vitest";
import { fitToolbarGroups } from "./toolbarLayout";

// Geçmiş, metin, biçim, bloklar, tablo, medya, bağlantılar.
const widths = [73, 320, 177, 177, 209, 107, 141];
it("keeps the new group order and hides the last group at the boundary", () => {
  expect(fitToolbarGroups(1600, widths)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  const exact = widths.reduce((sum, width) => sum + width, 0) + 6 * 6;
  expect(fitToolbarGroups(exact, widths)).toHaveLength(7);
  expect(fitToolbarGroups(exact - 1, widths)).toEqual([0, 1, 2, 3, 4, 5]);
});
it("hides groups from the end, preserving history longest", () => {
  expect(fitToolbarGroups(800, widths)).toEqual([0, 1, 2, 3]);
  expect(fitToolbarGroups(600, widths)).toEqual([0, 1]);
  expect(fitToolbarGroups(300, widths)).toEqual([0]);
  expect(fitToolbarGroups(110, widths)).toEqual([0]);
  expect(fitToolbarGroups(60, widths)).toEqual([]);
});
