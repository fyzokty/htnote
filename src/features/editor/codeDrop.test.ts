import { Compartment } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { undo, redo, undoDepth } from "@codemirror/commands";
import { describe, expect, it, vi } from "vitest";
import { codeDropCursorRect, codeDropPosition, createCodeDropCursor, formattedDropCursor, prepareCodeDrop, resolveCodeDropPosition } from "./codeDrop";
import { createCodeState, insertCodeDrop } from "./codeState";

describe("code file drops", () => {
  it("uses the same clamped position for preview and insertion, and converts caret coordinates", () => {
    expect(resolveCodeDropPosition(null, 9, 5)).toBe(5);
    expect(resolveCodeDropPosition(-2, 9, 15)).toBe(0);
    const view = { posAtCoords: vi.fn(() => 4), coordsAtPos: vi.fn(() => ({ left: 25, top: 40, bottom: 60 })), state: { doc: { length: 10 }, selection: { main: { head: 7 } } } } as unknown as EditorView;
    const position = codeDropPosition(view, { x: 30, y: 50 });
    expect(position).toBe(4);
    expect(codeDropCursorRect(view, position)).toEqual({ left: 24, top: 40, width: 2, height: 20 });
    expect(view.coordsAtPos).toHaveBeenCalledWith(4);
  });
  it("redraws after scrolling/resizing and removes the cursor on blur and destroy", () => {
    const dom = document.createElement("div");
    const coords = vi.fn(() => ({ left: 25, top: 40, bottom: 60 }));
    const view = { dom, posAtCoords: () => 4, coordsAtPos: coords, state: { doc: { length: 10 }, selection: { main: { head: 7 } } } } as unknown as EditorView;
    const cursor = createCodeDropCursor(view);
    cursor.update({ x: 30, y: 50 });
    const element = document.querySelector<HTMLElement>(".htnote-drop-cursor")!;
    expect(element.style.left).toBe("24px");
    coords.mockReturnValue({ left: 30, top: 20, bottom: 45 });
    document.dispatchEvent(new Event("scroll"));
    expect(element.style.left).toBe("29px");
    window.dispatchEvent(new Event("resize"));
    expect(element.style.height).toBe("25px");
    window.dispatchEvent(new Event("blur"));
    expect(element).not.toBeInTheDocument();
    cursor.update({ x: 30, y: 50 });
    cursor.update(null);
    expect(element).not.toBeInTheDocument();
    cursor.update({ x: 30, y: 50 });
    cursor.destroy();
    expect(element).not.toBeInTheDocument();
  });
  it("formats the document and puts the cursor immediately after the last complete media tag", () => {
    const original = "<div><p>Text</p></div>";
    const tags = ['<img src="./assets/one.png">', '<audio src="./assets/two.mp3" controls></audio>'];
    const next = prepareCodeDrop(original, 16, tags);
    expect(next.document).toBe('<div>\n  <p>Text</p>\n  <img src="./assets/one.png">\n  <audio src="./assets/two.mp3" controls></audio>\n</div>');
    expect(next.document.slice(0, next.cursor)).toMatch(/<\/audio>$/);
    expect(formattedDropCursor("short", tags[1], 0, 100)).toBe(5);
    expect(formattedDropCursor("a long unrelated document", tags[1], 0, 3)).toBe(3);
    expect(prepareCodeDrop(original, 16, tags, () => { throw new Error("format"); })).toEqual({ document: original.slice(0, 16) + tags.join("") + original.slice(16), cursor: 16 + tags.join("").length });
  });
  it("finds the newly inserted occurrence when the same tag already exists", () => {
    const tag = '<img src="./assets/same.png">';
    const original = `<div>${tag}</div>`;
    const next = prepareCodeDrop(original, original.indexOf("</div>"), [tag, tag]);
    expect(next.cursor).toBe(next.document.lastIndexOf(tag) + tag.length);
  });
  it("undoes insertion and formatting in one isolated step and restores the previous selection", () => {
    const view = new EditorView({ state: createCodeState("html", "<div><p>A</p></div>", new Compartment(), "light") });
    try {
      view.dispatch({ changes: { from: 8, insert: "B" }, selection: { anchor: 9 }, userEvent: "input.type" });
      const before = view.state.doc.toString();
      insertCodeDrop(view, before.indexOf("</div>"), ['<video src="./assets/video.mp4" controls></video>']);
      const after = view.state.doc.toString();
      expect(after).toContain("\n  <video");
      expect(undoDepth(view.state)).toBe(2);
      expect(after.slice(0, view.state.selection.main.head)).toMatch(/<\/video>$/);
      undo(view);
      expect(view.state.doc.toString()).toBe(before);
      expect(view.state.selection.main.head).toBe(9);
      redo(view);
      expect(view.state.doc.toString()).toBe(after);
      undo(view); undo(view);
      expect(view.state.doc.toString()).toBe("<div><p>A</p></div>");
    } finally { view.destroy(); }
  });
});
