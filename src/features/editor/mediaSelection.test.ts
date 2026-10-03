import { Editor } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { createVisualExtensions } from "@/features/editor/extensions";
import { selectMediaGap } from "@/features/editor/mediaSelection";

describe("media outside clicks", () => {
  it("records handler decisions only while the diagnostic hook is enabled", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: '<img src="a.svg">' });
    const dom = editor.view.nodeDOM(0) as HTMLElement;
    vi.spyOn(dom, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 50, 200, 150));
    vi.spyOn(editor.view, "focus").mockImplementation(() => {});
    // jsdom has no coordinate hit testing for the unhandled inside click.
    vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);
    const click = (x: number) => editor.view.dom.dispatchEvent(new MouseEvent("mousedown", {
      clientX: x, clientY: 100, bubbles: true, cancelable: true,
    }));
    try {
      click(400);
      expect(window.__htnoteDebugMediaClick).toBeUndefined();
      editor.commands.setNodeSelection(0);
      const debug = window.__htnoteDebugMediaClick = { calls: 0 } as NonNullable<Window["__htnoteDebugMediaClick"]>;
      click(400);
      expect(debug.calls).toBe(1);
      expect(debug.last).toMatchObject({
        x: 400, y: 100, isTrusted: false, decision: "selected-media-boundary",
        boundary: 1, bias: 1, handled: true, defaultPrevented: true,
        before: { type: "node", anchor: 0 }, after: { type: "gapcursor", pos: 1 },
        rows: [{ pos: 0, kind: "image", row: { x: 100, y: 50, width: 200, height: 150 } }],
      });
      click(200);
      expect(debug.calls).toBe(2);
      expect(debug.last).toMatchObject({ decision: "no-outside-media-boundary", handled: false, defaultPrevented: false });
      delete window.__htnoteDebugMediaClick;
      click(400);
      expect(window.__htnoteDebugMediaClick).toBeUndefined();
      expect(debug.calls).toBe(2);
    } finally {
      delete window.__htnoteDebugMediaClick;
      editor.destroy();
    }
  });

  it.each(["image", "audio", "video"] as const)("uses the clicked %s row despite incorrect hit testing and event targets", (kind) => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: {
      type: "doc", content: ["image", "image", kind, "video"].map((type) => ({ type, attrs: { src: "media" } })),
    } });
    // A compact NodeView may receive an outside event in older WebView2.
    // Playback NodeViews stop these events before handleDOMEvents runs.
    const nodeView = () => {
      const dom = document.createElement("div");
      dom.innerHTML = '<div class="htnote-media-preview"></div><div class="htnote-media-toolbar"></div>';
      return { dom, stopEvent: () => true };
    };
    editor.view.setProps({ nodeViews: { image: nodeView, audio: nodeView, video: nodeView } });
    for (let pos = 0; pos < 4; pos += 1) {
      const dom = editor.view.nodeDOM(pos) as HTMLElement;
      const top = pos * 100;
      vi.spyOn(dom, "getBoundingClientRect").mockReturnValue({ left: 100, right: 300, top, bottom: top + 80 } as DOMRect);
      vi.spyOn(dom.querySelector(".htnote-media-preview")!, "getBoundingClientRect")
        .mockReturnValue({ left: 100, right: 300, top: top + 20, bottom: top + 80 } as DOMRect);
      vi.spyOn(dom.querySelector(".htnote-media-toolbar")!, "getBoundingClientRect")
        .mockReturnValue({ left: 100, right: 350, top, bottom: top + 15 } as DOMRect);
    }
    vi.spyOn(editor.view, "focus").mockImplementation(() => {});
    const hitTest = vi.spyOn(editor.view, "posAtCoords");
    const dom = editor.view.nodeDOM(2) as HTMLElement;
    for (const wrongHit of [{ pos: 1, inside: 0 }, { pos: 0, inside: -1 }, null]) {
      hitTest.mockReturnValue(wrongHit);
      for (const target of [editor.view.dom, dom.querySelector(".htnote-media-preview")!, dom.querySelector(".htnote-media-toolbar")!]) {
        for (const [x, pos] of [[400, 3], [50, 2]]) {
          editor.commands.setNodeSelection(0);
          const event = new MouseEvent("mousedown", { clientX: x, clientY: 250, bubbles: true, cancelable: true });
          target.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(true);
          expect(editor.state.selection.toJSON()).toEqual({ type: "gapcursor", pos });
          target.dispatchEvent(new MouseEvent("mouseup", { clientX: x, clientY: 250, bubbles: true }));
          expect(editor.state.selection.toJSON()).toEqual({ type: "gapcursor", pos });
          expect(hitTest).not.toHaveBeenCalled();
        }
      }
    }
    // Actual previews, overhanging toolbar controls, other rows and right
    // clicks retain their native/NodeView behavior.
    for (const [x, y, button] of [[200, 250, 0], [325, 205, 0], [400, 900, 0], [400, 250, 2]]) {
      editor.commands.setNodeSelection(2);
      const event = new MouseEvent("mousedown", { clientX: x, clientY: y, button, bubbles: true, cancelable: true });
      dom.querySelector(".htnote-media-preview")!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);
      expect(editor.state.selection.from).toBe(2);
    }
    editor.setEditable(false);
    const readonlyClick = new MouseEvent("mousedown", { clientX: 400, clientY: 250, bubbles: true, cancelable: true });
    dom.querySelector(".htnote-media-preview")!.dispatchEvent(readonlyClick);
    expect(readonlyClick.defaultPrevented).toBe(false);
    const removeListener = vi.spyOn(editor.view.dom, "removeEventListener");
    editor.destroy();
    expect(removeListener).toHaveBeenCalledWith("mousedown", expect.any(Function), true);
  });

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
