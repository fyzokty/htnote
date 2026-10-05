import { afterEach, expect, it, vi } from "vitest";
import { editorViewport, setStickyToolbarInset } from "./editorViewport";

afterEach(() => vi.unstubAllGlobals());

it("starts the floating tool viewport below the sticky toolbar and clamps it to the window", () => {
  vi.stubGlobal("innerWidth", 800); vi.stubGlobal("innerHeight", 600);
  const scroll = document.createElement("div");
  scroll.getBoundingClientRect = () => new DOMRect(-10, 40, 900, 700);
  expect(editorViewport(scroll)).toEqual({ left: 0, top: 40, right: 800, bottom: 600 });
  setStickyToolbarInset(scroll, 64);
  expect(editorViewport(scroll)).toEqual({ left: 0, top: 104, right: 800, bottom: 600 });
  // Araç çubuğu kaydırma alanından uzunsa görünür alan boş kalır, ters dönmez.
  setStickyToolbarInset(scroll, 2000);
  expect(editorViewport(scroll)?.top).toBe(600);
  expect(editorViewport(null)).toBeUndefined();
});
