import type { Modifier } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";

import { restrictToTabStrip } from "./dragModifier";

function drag(x: number, y: number, rects = true, width = 160) {
  const rect = (left: number, right: number) => ({ left, right, top: 0, bottom: 40, width: right - left, height: 40 });
  return restrictToTabStrip({
    transform: { x, y, scaleX: 1, scaleY: 1 },
    draggingNodeRect: rects ? rect(260, 260 + width) : null,
    scrollableAncestorRects: rects ? [rect(100, 600)] : [],
  } as Parameters<Modifier>[0]);
}

describe("restrictToTabStrip", () => {
  it("locks both upward and downward drags to the horizontal axis", () => {
    expect(drag(50, 900)).toEqual({ x: 50, y: 0, scaleX: 1, scaleY: 1 });
    expect(drag(-50, -900).y).toBe(0);
  });

  it("clamps left and right movement to the visible strip", () => {
    expect(drag(-1000, 0).x).toBe(-160);
    expect(drag(1000, 0).x).toBe(180);
  });

  it("still locks vertically before measurements are available", () => {
    expect(drag(50, 100, false)).toEqual({ x: 50, y: 0, scaleX: 1, scaleY: 1 });
  });

  it("aligns an oversized tab to the left edge without inverted bounds", () => {
    expect(drag(1000, 100, true, 700).x).toBe(-160);
  });
});
