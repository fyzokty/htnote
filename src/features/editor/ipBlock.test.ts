import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { classifyTopLevel } from "./blockClassifier";
import { createVisualExtensions } from "./extensions";
import { readIpBlock, serializeIpBlock } from "./ipBlock";
import { serializeVisualHtml, wrapRawBlocks } from "./visualPipeline";
import { serializeBoard } from "./board";

const attrs = { title: "Başlık <&>\r\n", gateway: "10.67.106.14", prefix: 28, html: null };
const html = serializeIpBlock(attrs);
describe("IP block format", () => {
  it.each([attrs.gateway, "", "invalid \"<&>\r\n", "10.67.106.0", " 10.67.106.14 "])("round-trips text and invalid defaults with the computed fallback", (gateway) => {
    const saved = serializeIpBlock({ ...attrs, gateway });
    expect(readIpBlock(saved)).toEqual({ ...attrs, gateway, html: saved, background: "" });
    expect(classifyTopLevel(saved)[0].kind).toBe("ipblock");
  });
  it("preserves original HTML until attributes change and restores it with undo", () => {
    const original = html.replace('data-htnote-widget="ipblock"', "data-htnote-widget='ipblock' data-htnote-bg='mint'");
    expect(serializeIpBlock(readIpBlock(original)!)).toBe(original);
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(original) });
    try {
      expect(serializeVisualHtml(editor.getHTML())).toBe(original + "\n<p></p>");
      editor.commands.setNodeSelection(0); editor.commands.updateAttributes("ipblock", { gateway: "10.67.106.13", prefix: 30, background: "rose" });
      const changed = readIpBlock(classifyTopLevel(serializeVisualHtml(editor.getHTML()))[0].html)!;
      expect(changed.gateway).toBe("10.67.106.13"); expect(changed.prefix).toBe(30); expect(changed.background).toBe("rose");
      expect(serializeIpBlock(changed)).toContain('<pre class="htnote-ipblock-list">10.67.106.14</pre>');
      editor.commands.undo(); expect(serializeVisualHtml(editor.getHTML())).toBe(original + "\n<p></p>");
    } finally { editor.destroy(); }
  });
  it.each([
    html.replace('data-htnote-gw="', 'onclick="x()" data-htnote-gw="'),
    html.replace('data-htnote-gw="', 'data-htnote-gw="x" data-htnote-gw="'),
    html.replace('data-htnote-prefix="28"', 'data-htnote-prefix="028"'),
    html.replace('data-htnote-prefix="28"', 'data-htnote-prefix="31"'),
    html.replace('data-htnote-widget="ipblock"', 'data-htnote-widget="ipblock" data-htnote-bg="unknown"'),
    html.replace('data-htnote-widget="ipblock"', 'data-htnote-widget="ipblock" data-htnote-bg=""'),
    html.replace('htnote-ipblock-list', 'htnote-ipblock-list extra'),
    html.replace('10.67.106.1\n', '10.67.106.14\n'),
    html.replace('10.67.106.1\n', ''),
    html.replace('10.67.106.1\n', '10.67.106.2\n10.67.106.1\n'),
    html.replace('</pre>', '\n</pre>'),
    html.replace('</pre>', '<b>extra</b></pre>'),
    html.replace('<pre', '<!--extra--><pre'),
    html.replace('</pre>', ''),
    html.replace('</div>', ''),
    html.replace('</div>', '</div extra>'),
    html.replace('<pre', '<pre/><pre'),
    html.replace('</pre>', '</pre><span>extra</span>'),
  ])("preserves malformed widgets as htmlBlock", (source) => {
    expect(readIpBlock(source)).toBeNull();
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(source) });
    try {
      expect(editor.state.doc.firstChild?.type.name).toBe("htmlBlock"); expect(serializeVisualHtml(editor.getHTML())).toBe(source);
    } finally { editor.destroy(); }
  });
  it("inserts default /28 with a trailing paragraph and round-trips inside boards", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p></p>" });
    try {
      editor.commands.insertIpBlock(); expect(editor.state.doc.firstChild?.attrs.prefix).toBe(28); expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
      const board = serializeBoard([{ col: 1, span: 6, row: 1, html }]); editor.commands.setContent(wrapRawBlocks(board));
      expect(editor.state.doc.firstChild?.firstChild?.firstChild?.type.name).toBe("ipblock");
      expect(serializeVisualHtml(editor.getHTML())).toContain(html);
    } finally { editor.destroy(); }
  });
});
