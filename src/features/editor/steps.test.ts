import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { emptyStep, readSteps, serializeSteps, type StepsAttributes } from "./steps";
import { createVisualExtensions } from "./extensions";
import { serializeVisualHtml, wrapRawBlocks } from "./visualPipeline";
import { classifyTopLevel } from "./blockClassifier";
import { serializeBoard } from "./board";

const attrs: StepsAttributes = { title: "Guide <&>", html: null, items: [{ heading: 'Step <&> "', text: "\nfirst\r\nsecond\r", code: "\n\n<&>\r\nend", image: { src: './assets/a &"b.png', alt: '<&> " alt' } }] };
const html = serializeSteps(attrs);

describe("steps format", () => {
  it("escapes text and attributes, preserves newlines including the first pre LF and round-trips", () => {
    expect(readSteps(html)).toEqual({ ...attrs, html, background: "" });
    expect(classifyTopLevel(html)[0].kind).toBe("steps");
    const dom = new DOMParser().parseFromString(html, "text/html");
    expect(dom.querySelector("pre")?.textContent).toBe(attrs.items[0].code);
    expect(dom.querySelector("img")?.getAttribute("src")).toBe(attrs.items[0].image?.src);
    expect(dom.querySelector("script")).toBeNull();
    for (const code of ["", "\n", "\r\n", "a\n\nb\r\nc", null]) {
      const source = serializeSteps({ ...attrs, items: [{ ...attrs.items[0], code }] });
      expect(readSteps(source)?.items[0].code).toBe(code);
    }
  });
  it("preserves original HTML until changes, restores it with undo and round-trips in boards", () => {
    const original = html.replace('data-htnote-widget="steps"', "data-htnote-widget='steps' data-htnote-bg='mint'");
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(original) });
    try {
      expect(serializeVisualHtml(editor.getHTML())).toBe(original + "\n<p></p>");
      editor.commands.setNodeSelection(0); editor.commands.updateAttributes("steps", { title: "Changed", background: "rose" });
      expect(readSteps(classifyTopLevel(serializeVisualHtml(editor.getHTML()))[0].html)).toMatchObject({ title: "Changed", background: "rose" });
      editor.commands.undo(); expect(serializeVisualHtml(editor.getHTML())).toBe(original + "\n<p></p>");
      const board = serializeBoard([{ col: 1, span: 6, row: 1, html: original }]);
      editor.commands.setContent(wrapRawBlocks(board));
      expect(editor.state.doc.firstChild?.firstChild?.firstChild?.type.name).toBe("steps");
      expect(serializeVisualHtml(editor.getHTML())).toContain(original);
    } finally { editor.destroy(); }
  });
  it("keeps untouched empty steps but drops entirely empty steps only on new serialization", () => {
    const emptyHtml = '<div class="htnote-steps" data-htnote-widget="steps"><div class="htnote-steps-title"></div><ol class="htnote-steps-list"><li class="htnote-steps-item"><div class="htnote-steps-heading"> </div><div class="htnote-steps-text">\n</div><pre class="htnote-steps-code"> </pre></li></ol></div>';
    const parsed = readSteps(emptyHtml)!;
    expect(serializeSteps(parsed)).toBe(emptyHtml);
    expect(readSteps(serializeSteps({ ...parsed, title: "Changed" }))?.items).toEqual([]);
    expect(readSteps(serializeSteps({ ...attrs, items: [emptyStep(), { ...emptyStep(), text: "  text  " }, { ...emptyStep(), code: "\ncommand\n" }, { ...emptyStep(), image: { src: "assets/a.png", alt: "" } }] }))?.items).toHaveLength(3);
  });
  it.each(["../x.png", "/abs.png", "https://example.com/x.png", "javascript:alert(1)", "assets/../x", "assets\\x", "assets/a.png?q=1", "assets/a.png#x", "assets/%2e%2e/x", "assets/%5cx", "assets/%00x", "assets//x", "assets/./x", "assets/x%3fq"]) ("preserves unsafe image source %s as raw HTML", (src) => {
    const source = html.replace('./assets/a &amp;&quot;b.png', src);
    expect(readSteps(source)).toBeNull();
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(source) });
    try { expect(editor.state.doc.firstChild?.type.name).toBe("htmlBlock"); expect(serializeVisualHtml(editor.getHTML())).toBe(source); }
    finally { editor.destroy(); }
  });
  it.each([
    html.replace('class="htnote-steps"', 'class="htnote-steps extra"'),
    html.replace('data-htnote-widget="steps"', 'data-htnote-widget="steps" data-htnote-bg=""'),
    html.replace('data-htnote-widget="steps"', 'data-htnote-widget="steps" data-htnote-bg="other"'),
    html.replace('class="htnote-steps-item"', 'class="htnote-steps-item" onclick="x()"'),
    html.replace('class="htnote-steps-item"', 'class="htnote-steps-item" class="htnote-steps-item"'),
    html.replace('</li>', '<span>Extra</span></li>'),
    html.replace('</li>', ''),
    html.replace('</pre>', ''),
    html.replace('</div>', '</div extra>'),
    html.replace('<pre', '<!--extra--><pre'),
    html.replace('</pre>', '<b>rich</b></pre>'),
    html.replace('htnote-steps-text', 'other'),
    html.replace('</div><div class="htnote-steps-text">', '\n</div><div class="htnote-steps-text">'),
    html.replace(' alt="', ' loading="lazy" alt="'),
    html.replace(' alt="&lt;&amp;&gt; &quot; alt"', ''),
  ])("preserves malformed steps without rewriting their HTML", (source) => {
    expect(readSteps(source)).toBeNull();
    const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(source) });
    try { expect(editor.state.doc.firstChild?.type.name).toBe("htmlBlock"); expect(serializeVisualHtml(editor.getHTML())).toBe(source); }
    finally { editor.destroy(); }
  });
});
