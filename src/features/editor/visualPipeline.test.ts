import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { createVisualExtensions } from "@/features/editor/extensions";
import { loadForVisual, saveFromVisual, unwrapRawBlocks, wrapRawBlocks } from "@/features/editor/visualPipeline";

function roundTrip(inner: string): string {
  const editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(inner) });
  const result = unwrapRawBlocks(editor.getHTML());
  editor.destroy();
  return result;
}

const rawFixtures = [
  "<canvas id='plot'></canvas>",
  "<script>window.value = '<x>&';</script>",
  "<div class='custom'><b>Bold</b></div>",
  "<svg><circle r='5'></circle></svg>",
  "<iframe src='about:blank'></iframe>",
  "<!-- raw comment -->",
  "<p onclick='run()'>Unsafe</p>",
  "<p><script>alert(1)</script></p>",
  "<section>Türkçe 😀</section>",
  "<div data-x=\"a&b<>\">A\r\nB\tC</div>",
  "<img src=x onerror='window.bad()'>",
  "<style>p { color: red; }</style>",
  "<custom-element attr='\"&<>'>x</custom-element>",
  "Text & <unknown>y</unknown>",
  "<p data-y='1'><canvas></canvas></p>",
  "<p class='x' custom='y'>x</p>",
  "<div>line 1\nline 2</div>",
  "<canvas width='5' height='7'>fallback</canvas>",
  "<script>const x = '\\u{1f600}';</script>",
  "<form><input value='a&b'></form>",
];

describe("visualPipeline", () => {
  it.each(rawFixtures)("preserves raw fixture %# byte for byte", (html) => {
    expect(roundTrip(html)).toBe(html);
  });

  it("preserves rich attributes and mixed block order", () => {
    const inner = '<p class="x" data-y="1" id="intro" style="color: red">A <strong data-mark="yes">B</strong></p>' +
      '<canvas id="a"></canvas><p>Son 😀</p><script>window.a = 1;</script>';
    const result = roundTrip(inner);
    const container = document.createElement("div");
    container.innerHTML = result.replace(/<script>.*?<\/script>/s, "");
    expect(container.querySelector("p")?.getAttribute("class")).toBe("x");
    expect(container.querySelector("p")?.getAttribute("data-y")).toBe("1");
    expect(container.querySelector("p")?.getAttribute("id")).toBe("intro");
    expect(container.querySelector("strong")?.getAttribute("data-mark")).toBe("yes");
    expect(result.indexOf("<canvas")).toBeGreaterThan(result.indexOf("<p"));
    expect(result.indexOf("<script")).toBeGreaterThan(result.indexOf("Son"));
    expect(result).toContain('<canvas id="a"></canvas>');
    expect(result).toContain("<script>window.a = 1;</script>");
    expect(result).not.toContain("htnote-raw");
  });

  it("keeps classified elements without a TipTap node as raw blocks", () => {
    const inner = '<p>Before <img src="a.png" data-x="1"></p><video src="clip.mp4"></video><p>After</p>';
    expect(roundTrip(inner)).toContain('<p>Before <img src="a.png" data-x="1"></p><video src="clip.mp4"></video>');
  });

  it("preserves head and after slices when saving a changed document", () => {
    const full = '<!doctype html>\r\n<html><head><script>const x = 1;</script></head><body><main id="htnote-content"><canvas></canvas></main><script>tail()</script></body></html>';
    const loaded = loadForVisual(full);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const editor = new Editor({ extensions: createVisualExtensions(""), content: loaded.editorHtml });
    editor.commands.insertContentAt(editor.state.doc.content.size, "<p>New</p>");
    const saved = saveFromVisual(loaded, editor.getHTML());
    editor.destroy();
    expect(saved.slice(0, loaded.before.length)).toBe(loaded.before);
    expect(saved.slice(-loaded.after.length)).toBe(loaded.after);
    expect(saved).toBe(loaded.before + "<canvas></canvas><p>New</p>" + loaded.after);
    expect(saved).not.toContain("htnote-raw");
  });

  it("removes a deleted raw block", () => {
    const editor = new Editor({
      extensions: createVisualExtensions(""),
      content: wrapRawBlocks("<p>Before</p><canvas id='removed'></canvas><p>Kept</p>"),
    });
    let rawPosition: number | undefined;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === "htmlBlock") rawPosition = position;
    });
    expect(rawPosition).toBeDefined();
    editor.commands.deleteRange({ from: rawPosition!, to: rawPosition! + 1 });
    const result = unwrapRawBlocks(editor.getHTML());
    editor.destroy();
    expect(result).toBe("<p>Before</p><p>Kept</p>");
    expect(result).not.toContain("canvas");
  });
});
