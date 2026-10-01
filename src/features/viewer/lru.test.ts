import { describe, expect, it } from "vitest";

import { nextMounted } from "@/features/viewer/lru";

describe("nextMounted", () => {
  it("inserts and reactivates tabs in recency order", () => {
    expect(nextMounted([], "a", ["a", "b"])).toEqual(["a"]);
    expect(nextMounted(["b", "a"], "a", ["a", "b"])).toEqual(["a", "b"]);
  });

  it("evicts the oldest at six and removes closed tabs", () => {
    expect(nextMounted(["e", "d", "c", "b", "a"], "f", ["a", "b", "c", "d", "e", "f"]))
      .toEqual(["f", "e", "d", "c", "b"]);
    expect(nextMounted(["c", "b", "a"], "c", ["a", "c"])).toEqual(["c", "a"]);
  });
});
