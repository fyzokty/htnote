import { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { describe, expect, it } from "vitest";
import { classifyTopLevel } from "./blockClassifier";
import { createVisualExtensions } from "./extensions";
import { readCalc, serializeCalc } from "./calc";
import { serializeVisualHtml, wrapRawBlocks } from "./visualPipeline";
import { syncAppearanceStyle } from "@/features/viewer/noteAppearance";

const box = serializeCalc({ title: "Başlık", content: "Kira = 18.500\n<&>", html: null });

describe("calc format and visual pipeline", () => {
  it("preserves unchanged source exactly and restores it with undo", () => {
    const original = box.replace('data-htnote-widget="calc"', "data-htnote-widget='calc' data-htnote-bg='mint'");
    const attrs = readCalc(original)!;
    expect(serializeCalc(attrs)).toBe(original);
    expect(classifyTopLevel(original)[0].kind).toBe("calc");
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(original) });
    try {
      expect(editor.state.doc.firstChild?.type.name).toBe("calc");
      expect(serializeVisualHtml(editor.getHTML())).toBe(original + "\n<p></p>");
      editor.commands.setNodeSelection(0);
      editor.commands.updateAttributes("calc", { background: "rose" });
      const changed = serializeVisualHtml(editor.getHTML());
      expect(changed).toContain('data-htnote-bg="rose"');
      expect(readCalc(changed.split("\n<p>")[0])?.content).toBe(attrs.content);
      editor.commands.undo();
      expect(serializeVisualHtml(editor.getHTML())).toBe(original + "\n<p></p>");
      expect(serializeCalc({ ...attrs, background: "" })).not.toContain("data-htnote-bg");
    } finally { editor.destroy(); }
  });

  it.each(["", "\n2+3\n# <&>", "\r\nfirst\rnext", '</textarea><script>alert("x")</script>', "Bilinmeyen\n5/0"])("round-trips raw source with textarea escaping: %s", (content) => {
    const html = serializeCalc({ title: "", content, html: null });
    expect(readCalc(html)).toEqual({ title: "", content, html, background: "" });
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(html) });
    try { expect(editor.state.doc.firstChild?.attrs.content).toBe(content); } finally { editor.destroy(); }
  });

  it.each([
    box.replace('data-htnote-widget="calc"', 'data-htnote-widget="calc" data-htnote-bg="unknown"'),
    box.replace('data-htnote-widget="calc"', 'data-htnote-widget="calc" data-htnote-bg=""'),
    box.replace('data-htnote-widget="calc"', 'data-htnote-widget="calc" data-extra="x"'),
    box.replace('data-htnote-widget="calc"', 'data-htnote-widget="calc" data-htnote-bg="mint" data-htnote-bg="mint"'),
    box.replace('class="htnote-calc-title"', 'class="htnote-calc-title" id="extra"'),
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
  ])("keeps deviations as lossless htmlBlock", (html) => {
    expect(readCalc(html)).toBeNull();
    expect(classifyTopLevel(html)[0].kind).toBe("raw");
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(html) });
    try { expect(serializeVisualHtml(editor.getHTML())).toBe(html); } finally { editor.destroy(); }
  });

  it("inserts an empty atom with a trailing paragraph and deletes/restores it", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p></p>" });
    try {
      editor.commands.insertCalc();
      expect(editor.state.doc.firstChild?.attrs).toMatchObject({ title: "", content: "" });
      expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
      editor.commands.setNodeSelection(0); editor.view.dispatch(closeHistory(editor.state.tr)); editor.commands.deleteSelection();
      expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
      editor.commands.undo();
      expect(editor.state.doc.firstChild?.type.name).toBe("calc");
    } finally { editor.destroy(); }
  });

  it("exports readable source with managed appearance but no interactive DOM", () => {
    const html = syncAppearanceStyle(`<html><head></head><body><main id="htnote-content">${box}</main></body></html>`);
    expect(html).toContain('id="htnote-appearance"');
    expect(html).toContain(box);
    expect(html).not.toContain("calc-results");
    expect(html).not.toContain("/__htnote/bridge.js");
    expect(html).not.toContain('hidden="');
  });
});
