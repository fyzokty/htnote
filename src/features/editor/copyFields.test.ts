import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { classifyTopLevel } from "./blockClassifier";
import { createVisualExtensions } from "./extensions";
import { readCopyFields, serializeCopyFields } from "./copyFields";
import { serializeVisualHtml, wrapRawBlocks } from "./visualPipeline";

const attrs = { title: "Başlık <&>", fields: [{ label: "<script> & ü", value: "<script> & ü" }, { label: "  ikinci", value: "second" }], html: null };
const html = serializeCopyFields(attrs);

describe("copyfields format", () => {
  it.each([{ fields: attrs.fields }, { fields: [] }])("round-trips plain escaped text, defaults and empty lists", ({ fields }) => {
    const saved = serializeCopyFields({ ...attrs, fields });
    expect(readCopyFields(saved)).toEqual({ ...attrs, fields, html: saved, background: "" });
    expect(classifyTopLevel(saved)[0].kind).toBe("copyfields");
  });
  it("drops only entirely blank fields from new HTML without changing editor attributes", () => {
    const fields = [{ label: "", value: "" }, { label: " \t\u00a0", value: "\r\n " }, ...attrs.fields,
      { label: "Label only", value: " " }, { label: " ", value: "Value only" }, { label: "", value: "" }];
    const before = structuredClone(fields);
    expect(readCopyFields(serializeCopyFields({ ...attrs, fields }))?.fields).toEqual(fields.slice(2, 6));
    expect(fields).toEqual(before);
    expect(readCopyFields(serializeCopyFields({ ...attrs, fields: [{ label: " ", value: "\t" }] }))?.fields).toEqual([]);
  });
  it("preserves original blank rows exactly until the widget changes", () => {
    const original = html.replace('data-htnote-widget="copyfields"', "data-htnote-widget='copyfields'")
      .replace("</dl>", '<div class="htnote-copyfields-row"><dt> &#32;</dt><dd>&#9;</dd></div></dl>');
    const parsed = readCopyFields(original)!;
    expect(serializeCopyFields(parsed)).toBe(original);
    expect(readCopyFields(serializeCopyFields({ ...parsed, title: "Changed" }))?.fields).toEqual(attrs.fields);
    expect(readCopyFields(serializeCopyFields({ ...parsed, background: "mint" }))?.fields).toEqual(attrs.fields);
  });
  it("preserves source until attributes change, with undo and background round-trip", () => {
    const original = html.replace('data-htnote-widget="copyfields"', "data-htnote-widget='copyfields' data-htnote-bg='mint'");
    expect(serializeCopyFields(readCopyFields(original)!)).toBe(original);
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(original) });
    try {
      expect(editor.state.doc.firstChild?.attrs.fields).toEqual(attrs.fields);
      expect(serializeVisualHtml(editor.getHTML())).toBe(original + "\n<p></p>");
      editor.commands.setNodeSelection(0);
      editor.commands.updateAttributes("copyfields", { background: "rose" });
      expect(serializeVisualHtml(editor.getHTML())).toContain('data-htnote-bg="rose"');
      editor.commands.undo();
      expect(serializeVisualHtml(editor.getHTML())).toBe(original + "\n<p></p>");
      editor.commands.deleteSelection();
      expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
    } finally { editor.destroy(); }
  });
  it.each([
    html.replace('data-htnote-widget="copyfields"', 'data-htnote-widget="copyfields" data-htnote-bg="unknown"'),
    html.replace('data-htnote-widget="copyfields"', 'data-htnote-widget="copyfields" data-htnote-bg=""'),
    html.replace('<dt>', '<dt class="extra">'),
    html.replace('<dd>', '<dd onclick="x()">'),
    html.replace('<dt>', '<dt id="a" id="b">'),
    html.replace('<dl', '<!--extra--><dl'),
    html.replace('</dt>', ''),
    html.replace('</dd>', ''),
    html.replace('</dl>', ''),
    html.replace('</div>', '</div extra>'),
    html.replace('&lt;script&gt;', '<b>x</b>'),
    html.replace('&lt;script&gt;', 'a\nb'),
    html.replace('&lt;script&gt;', 'a&#13;b'),
    html.replace('</dd>', '</dd><dt>extra</dt>'),
    html.replace('htnote-copyfields-row', 'htnote-copyfields-row extra'),
    html.replace('<dd>', '<dd/><dd>'),
    html.replace('<dt>', '<dd>').replace('</dt>', '</dd>'),
  ])("keeps deviations lossless as htmlBlock", (source) => {
    expect(readCopyFields(source)).toBeNull();
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(source) });
    try {
      expect(editor.state.doc.firstChild?.type.name).toBe("htmlBlock");
      expect(serializeVisualHtml(editor.getHTML())).toBe(source);
    } finally { editor.destroy(); }
  });
  it("inserts one blank field and trailing paragraph; normalizes field line breaks", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p></p>" });
    try {
      editor.commands.insertCopyFields();
      expect(editor.state.doc.firstChild?.attrs.fields).toEqual([{ label: "", value: "" }]);
      expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
    } finally { editor.destroy(); }
    expect(readCopyFields(serializeCopyFields({ ...attrs, fields: [{ label: "a\r\nb", value: "x\ny\rz" }] }))?.fields[0]).toEqual({ label: "a b", value: "x y z" });
  });
});
