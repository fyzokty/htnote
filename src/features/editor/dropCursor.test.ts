import { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";

import { createNativeDropCursor, dropCursorRect, dropPosition } from "@/features/editor/dropCursor";
import { createVisualExtensions } from "@/features/editor/extensions";
import { toCssPoint } from "@/features/editor/fileDrop";

describe("native file drop cursor", () => {
  it("uses CSS coordinates and draws a two pixel text caret at the insertion position", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>BeforeAfter</p>" });
    const hit = vi.spyOn(editor.view, "posAtCoords").mockReturnValue({ pos: 7, inside: 0 });
    vi.spyOn(editor.view, "coordsAtPos").mockReturnValue({ left: 40, right: 40, top: 30, bottom: 54 });
    const point = toCssPoint({ x: 80, y: 100 }, 2);
    expect(dropPosition(editor.view, point)).toBe(7);
    expect(hit).toHaveBeenCalledWith({ left: 40, top: 50 });
    expect(dropCursorRect(editor.view, 7)).toEqual({ left: 39, top: 30, width: 2, height: 24 });
    const cursor = createNativeDropCursor(editor.view);
    cursor.update(point);
    expect(document.querySelector(".htnote-native-drop-cursor")).toHaveStyle({ left: "39px", top: "30px", width: "2px" });
    hit.mockReturnValue(null);
    cursor.update(point);
    expect(document.querySelector(".htnote-native-drop-cursor")).toBeNull();
    hit.mockReturnValue({ pos: 7, inside: 0 });
    cursor.update(point);
    window.dispatchEvent(new Event("blur"));
    expect(document.querySelector(".htnote-native-drop-cursor")).toBeNull();
    cursor.destroy();
    editor.destroy();
  });

  it("draws a horizontal line between block nodes and removes it on leave or destruction", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: '<img src="a.svg"><img src="b.svg">' });
    vi.spyOn(editor.view, "posAtCoords").mockReturnValue({ pos: 1, inside: -1 });
    vi.spyOn(editor.view.dom, "getBoundingClientRect").mockReturnValue({ left: 10, width: 600 } as DOMRect);
    vi.spyOn(editor.view.nodeDOM(0) as HTMLElement, "getBoundingClientRect").mockReturnValue({ bottom: 100 } as DOMRect);
    vi.spyOn(editor.view.nodeDOM(1) as HTMLElement, "getBoundingClientRect").mockReturnValue({ top: 120 } as DOMRect);
    expect(dropCursorRect(editor.view, 1)).toEqual({ left: 10, top: 109, width: 600, height: 2 });
    const cursor = createNativeDropCursor(editor.view);
    cursor.update({ x: 20, y: 110 });
    expect(document.querySelector(".htnote-native-drop-cursor")).toHaveStyle({ height: "2px", width: "600px" });
    cursor.update(null);
    expect(document.querySelector(".htnote-native-drop-cursor")).toBeNull();
    cursor.update({ x: 20, y: 110 });
    cursor.destroy();
    expect(document.querySelector(".htnote-native-drop-cursor")).toBeNull();
    editor.destroy();
  });
});
