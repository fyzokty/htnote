import { describe, expect, it } from "vitest";
import { mediaToolbarPosition } from "./mediaToolbarPosition";

describe("floating media placement", () => {
  const viewport = { left: 100, right: 800, top: 100, bottom: 600 };
  const anchor = { left: 300, right: 600, top: 300, bottom: 450 };
  const menu = { width: 200, height: 80 };
  it.each([["left", 300], ["center", 350], ["right", 400]])("follows %s alignment above the preview", (align, left) => {
    expect(mediaToolbarPosition(anchor, menu, viewport, String(align))).toEqual({ left, top: 212, visible: true });
  });
  it("falls below near the top, clamps edges and hides offscreen previews", () => {
    expect(mediaToolbarPosition({ left: 750, right: 850, top: 110, bottom: 160 }, menu, viewport, "left"))
      .toEqual({ left: 592, top: 168, visible: true });
    expect(mediaToolbarPosition({ ...anchor, top: 700, bottom: 900 }, menu, viewport, "left").visible).toBe(false);
  });
});
