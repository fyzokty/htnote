import { readFileSync } from "node:fs";
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
  '<span style="color: red">Top-level span</span>',
  '<p><span style="color: red"><strong><span style="color: blue">Nested colors</span></strong></span></p>',
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
  it("round-trips editable text colors and clears color without losing span attributes", () => {
    const html = '<html><head><style>.author {font-size: 2em}</style></head><body><main id="htnote-content"><p><span class="author" data-label="x" style="color: #3266bb; letter-spacing: 1px">Text</span></p></main></body></html>';
    const parts = loadForVisual(html);
    if (!parts.ok) throw new Error(parts.reason);
    expect(parts.editorHtml).not.toContain("htnote-raw");
    const editor = new Editor({ extensions: createVisualExtensions(""), content: parts.editorHtml });
    try {
      editor.commands.setTextSelection({ from: 1, to: 5 });
      expect(editor.getAttributes("textStyle").color).toBe("#3266bb");
      editor.commands.setColor("#b33d80");
      const saved = saveFromVisual(parts, editor.getHTML());
      const reloaded = loadForVisual(saved);
      if (!reloaded.ok) throw new Error(reloaded.reason);
      editor.commands.setContent(reloaded.editorHtml);
      editor.commands.setTextSelection({ from: 1, to: 5 });
      expect(editor.getAttributes("textStyle").color).toBe("rgb(179, 61, 128)");
      expect(saved).toContain('class="author"');
      expect(saved).toContain('data-label="x"');
      expect(saved).toContain("letter-spacing: 1px");
      editor.commands.unsetColor();
      expect(editor.getHTML()).not.toContain("color:");
      expect(editor.getHTML()).toContain('data-label="x"');
    } finally { editor.destroy(); }
  });

  it("keeps theme color variables through visual and code round-trips", () => {
    const inner = '<p><span style="color: var(--ht-color-red, #c43b4a)">Text</span></p>';
    expect(roundTrip(roundTrip(inner))).toContain('color: var(--ht-color-red, #c43b4a)');
  });

  it("keeps a new Rust note unchanged on the first visual save", () => {
    const full = readFileSync("src-tauri/templates/note.html", "utf8")
      .replace(/\{\{HTNOTE_TITLE\}\}/g, "New note")
      .replace("{{HTNOTE_METADATA}}", '<meta name="htnote-tags" content="">').trimEnd();
    const parts = loadForVisual(full);
    if (!parts.ok) throw new Error(parts.reason);
    const editor = new Editor({ extensions: createVisualExtensions(""), content: parts.editorHtml });
    try {
      expect(saveFromVisual(parts, editor.getHTML())).toBe(full);
    } finally { editor.destroy(); }
  });

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

  it("round-trips media blocks and nested sources", () => {
    const inner = '<img src="./assets/a.png" alt="A" title="Title" width="50%" class="hero" data-x="1">' +
      '<audio src="./assets/a.mp3" controls loop muted class="sound" data-x="2"><source src="./assets/b.ogg" type="audio/ogg" data-codec="vorbis"></audio>' +
      '<video src="./assets/v.mp4" controls poster="./assets/poster.png" autoplay id="clip" style="width: 50%"><source src="./assets/v.webm" type="video/webm" media="screen" srcset="./assets/v-small.webm 1x, ./assets/v.webm 2x" sizes="(max-width: 600px) 100vw, 600px"></video>';
    const result = roundTrip(inner);
    const container = document.createElement("div");
    container.innerHTML = result;
    expect(container.querySelector("img")?.getAttribute("src")).toBe("./assets/a.png");
    expect(container.querySelector("img")?.getAttribute("width")).toBe("50%");
    expect(container.querySelector("img")?.getAttribute("title")).toBe("Title");
    expect(container.querySelector("img")?.getAttribute("class")).toBe("hero");
    expect(container.querySelector("img")?.getAttribute("data-x")).toBe("1");
    expect(container.querySelector("audio")?.hasAttribute("controls")).toBe(true);
    expect(container.querySelector("audio")?.hasAttribute("loop")).toBe(true);
    expect(container.querySelector("audio source")?.getAttribute("type")).toBe("audio/ogg");
    expect(container.querySelector("audio source")?.getAttribute("data-codec")).toBe("vorbis");
    expect(container.querySelector("video")?.getAttribute("poster")).toBe("./assets/poster.png");
    expect(container.querySelector("video")?.hasAttribute("autoplay")).toBe(true);
    expect(container.querySelector("video source")?.getAttribute("media")).toBe("screen");
    expect(container.querySelector("video source")?.getAttribute("src")).toBe("./assets/v.webm");
    expect(container.querySelector("video source")?.getAttribute("type")).toBe("video/webm");
    expect(container.querySelector("video source")?.getAttribute("srcset")).toBe("./assets/v-small.webm 1x, ./assets/v.webm 2x");
    expect(container.querySelector("video source")?.getAttribute("sizes")).toBe("(max-width: 600px) 100vw, 600px");
    expect(result).not.toContain("htnote-raw");
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
    expect(saved).toBe(loaded.before + "\n  <canvas></canvas>\n  <p>New</p>\n" + loaded.after);
    expect(saved).not.toContain("htnote-raw");
  });

  it("keeps visual saves multiline and stable across visual/code round trips", () => {
    const raw = "<div data-x='raw'>first\r\n  <span> second </span></div>";
    const full = '<!doctype html>\n<html><head><title>Original</title></head><body>\n  <main id="htnote-content"><h1>Title</h1><ul><li><p>Item</p></li></ul>' + raw + '</main><aside>Outside</aside></body></html>';
    function save(html: string): string {
      const parts = loadForVisual(html);
      if (!parts.ok) throw new Error(parts.reason);
      const editor = new Editor({ extensions: createVisualExtensions(""), content: parts.editorHtml });
      const output = saveFromVisual(parts, editor.getHTML());
      editor.destroy();
      expect(output.startsWith(parts.before)).toBe(true);
      expect(output.endsWith(parts.after)).toBe(true);
      return output;
    }
    const saved = save(full);
    expect(saved).toContain('\n    <h1>Title</h1>\n    <ul>\n      <li>\n        <p>Item</p>');
    expect(saved).toContain(raw);
    expect(saved).toContain('\n  </main><aside>Outside</aside>');
    expect(save(saved)).toBe(saved);
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
