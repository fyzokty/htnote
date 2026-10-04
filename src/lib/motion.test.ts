import { describe, expect, it } from "vitest";
import { applyReducedMotion, resolveReducedMotion } from "./motion";

describe("motion preference", () => {
  it("resolves overrides and both system preferences", () => {
    for (const system of [true, false]) {
      expect(resolveReducedMotion("system", system)).toBe(system);
      expect(resolveReducedMotion("on", system)).toBe(false);
      expect(resolveReducedMotion("off", system)).toBe(true);
    }
  });
  it("applies both values to the root", () => {
    applyReducedMotion(true);
    expect(document.documentElement).toHaveAttribute("data-reduced-motion", "true");
    applyReducedMotion(false);
    expect(document.documentElement).toHaveAttribute("data-reduced-motion", "false");
  });
});
