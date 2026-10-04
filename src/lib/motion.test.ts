import { describe, expect, it } from "vitest";
import { resolveReducedMotion } from "./motion";

describe("motion preference", () => {
  it("resolves overrides and both system preferences", () => {
    for (const system of [true, false]) {
      expect(resolveReducedMotion("system", system)).toBe(system);
      expect(resolveReducedMotion("on", system)).toBe(false);
      expect(resolveReducedMotion("off", system)).toBe(true);
    }
  });
});
