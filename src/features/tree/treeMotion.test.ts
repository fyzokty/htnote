import { expect, it } from "vitest";
import { animatedFolderChange } from "./treeMotion";

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
