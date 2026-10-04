import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { classifyTopLevel } from "./blockClassifier";
import { createVisualExtensions } from "./extensions";
import { readChecklist, serializeChecklist } from "./checklist";
import { serializeVisualHtml, wrapRawBlocks } from "./visualPipeline";

const attrs = { title: "Başlık <&>", items: [{ text: "<script> & ü", checked: true }, { text: "  ikinci", checked: false }], html: null };
const html = serializeChecklist(attrs);

describe("checklist format", () => {
  it.each([{ items: attrs.items }, { items: [] }, { items: [{ text: "", checked: false }] }])("round-trips plain escaped text, defaults and empty lists", ({ items }) => {
    const saved = serializeChecklist({ ...attrs, items });
    expect(readChecklist(saved)).toEqual({ ...attrs, items, html: saved, background: "" });
    expect(classifyTopLevel(saved)[0].kind).toBe("checklist");
  });
  it("preserves source until attributes change, with undo and background round-trip", () => {
    const original = html.replace('data-htnote-widget="checklist"', "data-htnote-widget='checklist' data-htnote-bg='mint'").replace(" checked>", ' checked="checked">');
    expect(serializeChecklist(readChecklist(original)!)).toBe(original);
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(original) });
    try {
      expect(editor.state.doc.firstChild?.attrs.items).toEqual(attrs.items);
      expect(serializeVisualHtml(editor.getHTML())).toBe(original + "\n<p></p>");
      editor.commands.setNodeSelection(0);
      editor.commands.updateAttributes("checklist", { background: "rose" });
      expect(serializeVisualHtml(editor.getHTML())).toContain('data-htnote-bg="rose"');
      editor.commands.undo();
      expect(serializeVisualHtml(editor.getHTML())).toBe(original + "\n<p></p>");
      editor.commands.deleteSelection();
      expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
    } finally { editor.destroy(); }
  });
  it.each([
    html.replace('data-htnote-widget="checklist"', 'data-htnote-widget="checklist" data-htnote-bg="unknown"'),
    html.replace('data-htnote-widget="checklist"', 'data-htnote-widget="checklist" data-htnote-bg=""'),
    html.replace('type="checkbox" checked', 'type="checkbox" checked checked'),
    html.replace('type="checkbox"', 'type="checkbox" onclick="x()"'),
    html.replace(' checked>', ' checked="false">'),
    html.replace('type="checkbox"', 'type="text"'),
    html.replace("</li>", ""),
    html.replace("</label>", ""),
    html.replace("</ul>", ""),
    html.replace("</div>", "</div extra>"),
    html.replace("&lt;script&gt;", "<b>x</b>"),
    html.replace("&lt;script&gt;", "a\nb"),
    html.replace("&lt;script&gt;", "a&#13;b"),
    html.replace("<li>", "<li id='extra'>"),
    html.replace("<ul", "<!--extra--><ul"),
  ])("keeps deviations lossless as htmlBlock", (source) => {
    expect(readChecklist(source)).toBeNull();
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(source) });
    try {
      expect(editor.state.doc.firstChild?.type.name).toBe("htmlBlock");
      expect(serializeVisualHtml(editor.getHTML())).toBe(source);
    } finally { editor.destroy(); }
  });
  it("inserts one blank item and trailing paragraph; serializes no item line breaks", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p></p>" });
    try {
      editor.commands.insertChecklist();
      expect(editor.state.doc.firstChild?.attrs.items).toEqual([{ text: "", checked: false }]);
      expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
    } finally { editor.destroy(); }
    expect(readChecklist(serializeChecklist({ ...attrs, items: [{ text: "a\r\nb", checked: false }] }))?.items[0].text).toBe("a b");
  });
});
