import { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVisualExtensions } from "../extensions";
import { serializeTextBox } from "../textBox";
import { serializeVisualHtml, wrapRawBlocks } from "../visualPipeline";
import { widgetMotionKey } from "./widgetMotion";

afterEach(() => {
  delete document.documentElement.dataset.reducedMotion;
  vi.unstubAllGlobals();
});

const marks = (editor: Editor) => widgetMotionKey.getState(editor.state)!.find();

describe("widget insertion provenance", () => {
  it("leaves initial content and setContent unmarked and preserves source HTML", () => {
    const source = serializeTextBox({ title: "Loaded", content: "Saved", html: null }).replace('data-htnote-widget="textbox"', "data-htnote-widget='textbox'");
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(source) });
    try {
      expect(marks(editor)).toHaveLength(0);
      expect(serializeVisualHtml(editor.getHTML())).toContain(source);
      editor.commands.insertTextBox();
      expect(marks(editor)).toHaveLength(1);
      editor.commands.setContent(wrapRawBlocks(source));
      expect(marks(editor)).toHaveLength(0);
      expect(serializeVisualHtml(editor.getHTML())).toContain(source);
    } finally { editor.destroy(); }
  });

  it.each(["insertTextBox", "insertChecklist", "insertCopyFields", "insertTemplate", "insertCalc", "insertIpBlock"] as const)("marks only %s insertions without changing saved attributes or undo history", (command) => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>Existing text</p>" });
    const baseline = editor.getHTML();
    try {
      expect(editor.can()[command]()).toBe(true);
      expect(marks(editor)).toHaveLength(0);
      expect(editor.getHTML()).toBe(baseline);
      editor.commands[command]();
      const marked = marks(editor);
      expect(marked).toHaveLength(1);
      const node = editor.state.doc.nodeAt(marked[0].from)!;
      expect(Object.keys(node.attrs)).not.toContain("motion");
      const saved = serializeVisualHtml(editor.getHTML());
      expect(saved).not.toMatch(/htnote-widget-(enter|pop|feedback)|data-.*motion/);
      const selection = editor.state.selection;
      editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
      expect(editor.state.selection.eq(selection)).toBe(true);
      expect(marks(editor)).toHaveLength(1);
      expect(serializeVisualHtml(editor.getHTML())).toBe(saved);
      const finished = Object.assign(new Event("animationend", { bubbles: true }), { animationName: "htnote-widget-enter" });
      editor.view.nodeDOM(marked[0].from)!.dispatchEvent(finished);
      expect(marks(editor)).toHaveLength(0);
      expect(editor.state.selection.eq(selection)).toBe(true);
      expect(serializeVisualHtml(editor.getHTML())).toBe(saved);
      expect(editor.commands.undo()).toBe(true);
      expect(editor.getHTML()).toBe(baseline);
      expect(marks(editor)).toHaveLength(0);
      expect(editor.commands.redo()).toBe(true);
      expect(serializeVisualHtml(editor.getHTML())).toBe(saved);
      expect(marks(editor)).toHaveLength(0);
    } finally { editor.destroy(); }
  });

  it("maps insertion marks across subsequent edits without marking loaded widgets", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(serializeTextBox({ title: "Loaded", content: "", html: null })) });
    try {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.commands.insertTextBox();
      const before = marks(editor)[0].from;
      editor.view.dispatch(closeHistory(editor.state.tr));
      editor.commands.insertContentAt(0, "<p>Before</p>");
      const marked = marks(editor);
      expect(marked).toHaveLength(1);
      expect(marked[0].from).toBeGreaterThan(before);
      expect(editor.state.doc.nodeAt(marked[0].from)?.attrs.title).toBe("");
      editor.commands.undo();
      expect(marks(editor)[0].from).toBe(before);
    } finally { editor.destroy(); }
  });

  it.each(["app", "system"])("skips insertion marks with reduced motion from %s", (preference) => {
    if (preference === "app") document.documentElement.dataset.reducedMotion = "true";
    else vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p></p>" });
    try {
      editor.commands.insertTextBox();
      expect(marks(editor)).toHaveLength(0);
      expect(editor.state.doc.firstChild?.type.name).toBe("textBox");
      expect(editor.commands.undo()).toBe(true);
      expect(editor.commands.redo()).toBe(true);
      expect(marks(editor)).toHaveLength(0);
    } finally { editor.destroy(); }
  });

  it("lets app motion preference override system reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    document.documentElement.dataset.reducedMotion = "false";
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p></p>" });
    try {
      editor.commands.insertTextBox();
      expect(marks(editor)).toHaveLength(1);
    } finally { editor.destroy(); }

    document.documentElement.dataset.reducedMotion = "true";
    const reducedEditor = new Editor({ extensions: createVisualExtensions(""), content: "<p></p>" });
    try {
      reducedEditor.commands.insertTextBox();
      expect(marks(reducedEditor)).toHaveLength(0);
    } finally { reducedEditor.destroy(); }
  });
});
