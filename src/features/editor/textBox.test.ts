import { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { describe, expect, it } from "vitest";
import { classifyTopLevel } from "./blockClassifier";
import { createVisualExtensions } from "./extensions";
import { readTextBox, serializeTextBox, textBoxBoundary, leaveTextBox } from "./textBox";
import { serializeVisualHtml, wrapRawBlocks } from "./visualPipeline";

const box = serializeTextBox({ title: "Başlık", content: "first\n<&>\nlast", html: null });
describe("textBox format", () => {
  it("recognizes only the exact top-level shape and retains its original source", () => {
    expect(classifyTopLevel(box)[0].kind).toBe("textBox");
    const original = box.replace('class="htnote-textbox"', "class='htnote-textbox'");
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(original) });
    try {
      expect(editor.state.doc.firstChild?.type.name).toBe("textBox");
      expect(serializeVisualHtml(editor.getHTML())).toBe(original + "\n<p></p>");
    } finally { editor.destroy(); }
  });
  it.each([
    box.replace('data-htnote-widget="textbox"', 'data-htnote-widget="textbox" data-v="2"'),
    box.replace('class="htnote-textbox-title"', 'class="htnote-textbox-title" id="extra"'),
    box.replace('rows="3"', 'rows="4"'),
    box.replace('rows="3"', 'rows="3" onclick="alert(1)"'),
    box.replace('rows="3"', 'rows="3" rows="3"'),
    box.replace('rows="3"', 'rows="3" rows'),
    box.replace("</textarea>", "</textarea class='extra'>"),
    box.replace("Başlık", "<b>Başlık</b>"),
    box.replace("</textarea>", "</textarea><p>Extra</p>"),
    box.replace('spellcheck="false" ', ""),
    box.replace("</textarea>", ""),
    box.replace("</div><textarea", "<textarea"),
    box.replace("</div><textarea", "</div><!--extra--><textarea"),
  ])("keeps deviations as lossless raw HTML", (html) => {
    expect(classifyTopLevel(html)[0].kind).toBe("raw");
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(html) });
    try { expect(serializeVisualHtml(editor.getHTML())).toBe(html); } finally { editor.destroy(); }
  });
  it.each(["", "\nfirst\n<&>\nlast", "\r\nfirst\rnext", '</textarea><script>alert("x")</script>'])("round-trips empty titles and escaped multiline content: %s", (content) => {
    const html = serializeTextBox({ title: "", content, html: null });
    expect(readTextBox(html)).toEqual({ title: "", content, html });
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(html) });
    try { expect(editor.state.doc.firstChild?.attrs.content).toBe(content); } finally { editor.destroy(); }
  });
  it("inserts an empty box followed by a paragraph, supports selection, deletion and history", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p></p>" });
    try {
      editor.commands.insertTextBox();
      expect(editor.state.doc.firstChild?.attrs).toMatchObject({ title: "", content: "" });
      expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
      editor.commands.setNodeSelection(0);
      editor.view.dispatch(closeHistory(editor.state.tr));
      editor.commands.deleteSelection();
      expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
      editor.commands.undo();
      expect(editor.state.doc.firstChild?.type.name).toBe("textBox");
      editor.commands.redo();
      expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
    } finally { editor.destroy(); }
  });
  it("leaves either edge and creates a preceding paragraph if necessary", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(box) });
    try {
      leaveTextBox(editor, 0, 1, 1);
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(editor.state.selection.from).toBe(2);
      leaveTextBox(editor, 0, 1, -1);
      expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
      expect(editor.state.selection.from).toBe(1);
      expect(textBoxBoundary("ArrowUp", "abc", 0, 0)).toBe(-1);
      expect(textBoxBoundary("ArrowDown", "abc", 3, 3)).toBe(1);
      expect(textBoxBoundary("ArrowUp", "abc", 0, 1)).toBeNull();
      expect(textBoxBoundary("ArrowDown", "abc", 1, 1)).toBeNull();
    } finally { editor.destroy(); }
  });
});
