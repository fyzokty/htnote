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
