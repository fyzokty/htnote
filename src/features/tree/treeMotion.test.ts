import { expect, it } from "vitest";
import { animateBulkCollapse, animatedFolderChange } from "./treeMotion";

it("animates only a single change outside filtering and loading", () => {
  const closed = new Set<string>();
  const open = new Set(["A"]);
  expect(animatedFolderChange(closed, open, false, false)).toBe("A");
  expect(animatedFolderChange(open, closed, false, false)).toBe("A");
  expect(animatedFolderChange(open, open, false, false)).toBeNull();
  expect(animatedFolderChange(closed, new Set(["A", "B"]), false, false)).toBeNull();
  expect(animatedFolderChange(closed, open, true, false)).toBeNull();
  expect(animatedFolderChange(closed, open, false, true)).toBeNull();
});

it("animates explicit bulk closure, including filtered groups, but not filter-driven changes", () => {
  const open = new Set(["A", "B"]);
  const closed = new Set<string>();
  expect(animateBulkCollapse(open, closed, true, false)).toBe(true);
  expect(animateBulkCollapse(open, closed, false, false)).toBe(false);
  expect(animateBulkCollapse(open, closed, true, true)).toBe(false);
  expect(animateBulkCollapse(closed, open, true, false)).toBe(false);
});
