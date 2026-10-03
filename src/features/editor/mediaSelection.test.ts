import { Editor } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { createVisualExtensions } from "@/features/editor/extensions";
import { selectMediaGap } from "@/features/editor/mediaSelection";

describe("media outside clicks", () => {
  it.each(["image", "audio", "video"] as const)("places a gap cursor before or after a lone %s", (kind) => {
    const editor = new Editor({ extensions: createVisualExtensions("") });
    editor.commands.insertMedia({ kind, relPath: "./assets/media", name: "Media" });
    const dom = editor.view.nodeDOM(0) as HTMLElement;
    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({ left: 100, right: 300, top: 50, bottom: 200 } as DOMRect);
    vi.spyOn(editor.view, "focus").mockImplementation(() => {});
    for (const [x, pos] of [[400, 1], [50, 0]]) {
      editor.commands.setNodeSelection(0);
      expect(selectMediaGap(editor.view, new MouseEvent("click", { clientX: x, clientY: 100 }))).toBe(true);
      expect(editor.state.selection).toBeInstanceOf(GapCursor);
      expect(editor.state.selection.from).toBe(pos);
      expect(editor.state.selection).not.toBeInstanceOf(NodeSelection);
    }
    editor.destroy();
  });

  it("uses a neighboring text position when available and leaves inside clicks alone", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: '<img src="a.svg"><p>After</p>' });
    const dom = editor.view.nodeDOM(0) as HTMLElement;
    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({ left: 100, right: 300, top: 50, bottom: 200 } as DOMRect);
    vi.spyOn(editor.view, "focus").mockImplementation(() => {});
    editor.commands.setNodeSelection(0);
    expect(selectMediaGap(editor.view, new MouseEvent("click", { clientX: 200, clientY: 100 }))).toBe(false);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(selectMediaGap(editor.view, new MouseEvent("click", { clientX: 400, clientY: 100 }))).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.from).toBe(2);
    editor.destroy();
  });

  it("handles outside mousedown before coordinate hit testing and native selection", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: '<img src="a.svg">' });
    const dom = editor.view.nodeDOM(0) as HTMLElement;
    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({ left: 100, right: 300, top: 50, bottom: 200 } as DOMRect);
    vi.spyOn(editor.view, "focus").mockImplementation(() => {});
    const hitTest = vi.spyOn(editor.view, "posAtCoords").mockReturnValue({ pos: 1, inside: 0 });
    editor.commands.setNodeSelection(0);
    const event = new MouseEvent("mousedown", { clientX: 400, clientY: 100, bubbles: true, cancelable: true });
    editor.view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(hitTest).not.toHaveBeenCalled();
    expect(editor.state.selection).toBeInstanceOf(GapCursor);
    expect(editor.state.selection.from).toBe(1);
    // A second click at the same point must not enter ProseMirror's double-click path.
    editor.view.dom.dispatchEvent(new MouseEvent("mousedown", { clientX: 400, clientY: 100, bubbles: true, cancelable: true }));
    expect(editor.state.selection).toBeInstanceOf(GapCursor);
    expect(hitTest).not.toHaveBeenCalled();
    editor.destroy();
  });
});
