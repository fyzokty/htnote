import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createVisualExtensions } from "./extensions";
import { wrapRawBlocks, serializeVisualHtml } from "./visualPipeline";

function key(editor: Editor, name: string, ctrlKey = false) {
  const event = new KeyboardEvent("keydown", { key: name, ctrlKey, bubbles: true, cancelable: true });
  editor.view.dom.dispatchEvent(event);
}

describe("code block keyboard", () => {
  it("keeps Enter and indentation inside one code block across saving", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>first</p>" });
    try {
      editor.commands.setTextSelection(6);
      editor.commands.toggleCodeBlock();
      key(editor, "Enter");
      editor.commands.insertContent("  second");
      key(editor, "Enter");
      editor.commands.insertContent("third");
      expect(editor.getHTML()).toBe("<pre><code>first\n  second\nthird</code></pre>");
      const saved = serializeVisualHtml(editor.getHTML(), 0);
      editor.commands.setContent(wrapRawBlocks(saved));
      expect(editor.state.doc.childCount).toBe(1);
      expect(editor.state.doc.firstChild?.textContent).toBe("first\n  second\nthird");
    } finally { editor.destroy(); }
  });
  it.each(["triple", "arrow", "mod"])("exits the final block using %s", (method) => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<pre><code>x</code></pre>" });
    try {
      editor.commands.setTextSelection(2);
      if (method === "triple") { key(editor, "Enter"); key(editor, "Enter"); key(editor, "Enter"); }
      else key(editor, method === "arrow" ? "ArrowDown" : "Enter", method === "mod");
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
    } finally { editor.destroy(); }
  });
});
