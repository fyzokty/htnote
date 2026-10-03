import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Editor } from "@tiptap/core";

import { createNote, editNote, invoke, openNote, saveShortcut, useTempRoot, withNoteFrame } from "../helpers/flows";

// WebView2'nin desteklediği codec ile küçük, gerçek bir video üretir; harici araç gerekmez.
async function videoBytes(): Promise<number[]> {
  const result = await browser.executeAsync((done) => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(10);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      void new Blob(chunks).arrayBuffer().then((buffer) => done(Array.from(new Uint8Array(buffer))));
    };
    recorder.start();
    let frame = 0;
    const timer = setInterval(() => {
      context.fillStyle = frame % 2 ? "#4f46e5" : "#6366f1";
      context.fillRect(0, 0, canvas.width, canvas.height);
      frame += 1;
      if (frame === 10) { clearInterval(timer); recorder.stop(); }
    }, 100);
  });
  return result as number[];
}

function audioBytes(): number[] {
  const samples = 8000;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  return Array.from(wav);
}

async function clickMediaGap(selector: string, side: "left" | "right" = "right") {
  await $(selector).scrollIntoView();
  const point = await browser.execute((selector, side) => {
    const surface = document.querySelector<HTMLElement>(".tiptap")! as HTMLElement & { editor: Editor };
    const editor = surface.getBoundingClientRect();
    const preview = document.querySelector<HTMLElement>(selector)!;
    const media = preview.getBoundingClientRect();
    let boundaries: number[] = [];
    surface.editor.state.doc.descendants((node, pos) => {
      if (surface.editor.view.nodeDOM(pos) === preview.closest(".htnote-media-node")) {
        boundaries = [pos, pos + node.nodeSize];
      }
    });
    return {
      x: Math.round(side === "right" ? editor.right - 8 : editor.left + 8),
      y: Math.round(media.top + media.height / 2),
      edge: side === "right" ? media.right : media.left,
      boundaries,
    };
  }, selector, side);
  assert.ok(side === "right" ? point.x > point.edge : point.x < point.edge, "Click must be outside the media preview");
  assert.equal(point.boundaries.length, 2);
  const selection = () => browser.execute(() => {
    const editor = (document.querySelector(".tiptap") as HTMLElement & { editor: Editor }).editor;
    return editor.state.selection.toJSON() as { type: string; pos?: number };
  });
  try {
    await browser.performActions([{ type: "pointer", id: "media-gap", parameters: { pointerType: "mouse" }, actions: [
      { type: "pointerMove", origin: "viewport", x: point.x, y: point.y }, { type: "pointerDown", button: 0 },
    ] }]);
    // WebView2 versions can resolve the same outside point to either adjacent
    // gap. Both are valid, but selecting the atom or a distant gap is a failure.
    const down = await selection();
    assert.equal(down.type, "gapcursor", "Outside mousedown must place a gap cursor, not select media");
    assert.ok(down.pos !== undefined && point.boundaries.includes(down.pos),
      `Outside mousedown must use a boundary of the clicked media (${point.boundaries}), got ${down.pos}`);
    await browser.performActions([{ type: "pointer", id: "media-gap", parameters: { pointerType: "mouse" }, actions: [
      { type: "pointerUp", button: 0 },
    ] }]);
    assert.deepEqual(await selection(), down, "Outside mouseup must keep the cursor at the same media boundary");
    await browser.waitUntil(async () => browser.execute(() => !document.querySelector(".htnote-media.is-selected")),
      { timeout: 5000, timeoutMsg: "Outside click left a media preview selected" });
  } finally {
    await browser.releaseActions();
  }
}

describe("visual media previews", () => {
  let restore: (() => Promise<void>) | undefined;
  beforeEach(async () => { ({ restore } = await useTempRoot()); });
  afterEach(async () => { await restore?.(); });

  it("loads relative images and direct/nested audio/video sources without autoplay", async () => {
    const note = await createNote("Media previews");
    const saveAsset = (name: string, bytes: number[]) => invoke<{ relPath: string }>("save_asset_bytes", {
      noteId: note.id, suggestedName: name, bytes,
    });
    const imageData = await browser.execute(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#4f46e5";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.font = "24px sans-serif";
      context.fillText("Media preview", 24, 98);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    const image = await saveAsset("preview image.png", Array.from(Buffer.from(imageData, "base64")));
    const svg = await saveAsset("preview.svg", Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="currentColor"/></svg>')));
    const audio = await saveAsset("preview.wav", audioBytes());
    const video = await saveAsset("preview.webm", await videoBytes());
    const base = await invoke<{ html: string; css: string | null; js: string | null; contentHash: string }>("read_note", { id: note.id });
    const content = `<img src="${image.relPath.replace(/ /g, "%20")}" alt="Preview" width="320">` +
      `<img src="${svg.relPath}" alt="SVG preview" width="120">` +
      `<audio src="${audio.relPath}" autoplay preload="none"></audio>` +
      `<audio autoplay><source src="${audio.relPath}" type="audio/wav"></audio>` +
      `<video src="${video.relPath}" poster="${image.relPath}" autoplay preload="none"></video>` +
      `<video autoplay><source src="${video.relPath}" type="video/webm"></video>`;
    await invoke("save_note", { id: note.id, payload: {
      css: base.css ?? "", js: base.js ?? "", expectedHash: base.contentHash,
      html: base.html.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/, `$1${content}$2`),
    } });
    await openNote(note.id);
    await editNote();
    await $(".htnote-visual-editor .tiptap img").waitForDisplayed();
    const origin = await invoke<string>("get_note_origin");
    await browser.waitUntil(async () => browser.execute(() => {
      const images = Array.from(document.querySelectorAll<HTMLImageElement>(".tiptap img"));
      const media = Array.from(document.querySelectorAll<HTMLMediaElement>(".tiptap audio, .tiptap video"));
      return images.length === 2 && images.every((image) => image.naturalWidth > 0) && media.length === 4 && media.every((element) => element.readyState >= 1);
    }), { timeout: 15000, timeoutMsg: "Visual media did not load from the note origin" });
    const loaded = await browser.execute(() => ({
      image: document.querySelector<HTMLImageElement>(".tiptap img")!.src,
      media: Array.from(document.querySelectorAll<HTMLMediaElement>(".tiptap audio, .tiptap video"))
        .map((element) => ({ src: element.currentSrc, paused: element.paused, controls: element.controls, kind: element.tagName,
          controlsList: element.getAttribute("controlslist"),
          error: element.error?.code ?? null, autoplay: element.autoplay, time: element.currentTime })),
    }));
    assert.ok(loaded.image.startsWith(`${origin}/${note.id}/assets/`));
    for (const media of loaded.media) {
      assert.ok(media.src.startsWith(`${origin}/${note.id}/assets/`));
      assert.equal(media.error, null);
      assert.equal(media.paused, true);
      assert.equal(media.autoplay, false);
      assert.equal(media.controls, media.kind === "VIDEO");
      assert.equal(media.controlsList, "nodownload");
      assert.equal(media.time, 0);
    }

    const compact = await browser.execute(() => {
      const editor = document.querySelector<HTMLElement>(".tiptap")!;
      const media = document.querySelector<HTMLElement>(".htnote-media-node")!;
      return media.getBoundingClientRect().width < editor.getBoundingClientRect().width;
    });
    assert.equal(compact, true);
    await clickMediaGap(".tiptap img[alt='Preview']");
    await $(".tiptap img[alt='Preview']").click();
    await $(".htnote-media-image .htnote-media-toolbar").waitForDisplayed();
    await clickMediaGap(".tiptap img[alt='Preview']");
    await clickMediaGap(".tiptap img[alt='SVG preview']");
    await clickMediaGap(".tiptap .ht-audio-card");
    await clickMediaGap(".tiptap video");
    for (const selector of [".tiptap img[alt='Preview']", ".tiptap img[alt='SVG preview']", ".tiptap .ht-audio-card", ".tiptap video"]) {
      await clickMediaGap(selector, "left");
    }
    await $(".tiptap img[alt='Preview']").click();
    await $(".htnote-media-image .htnote-media-toolbar").waitForDisplayed();
    const themeWasDark = await browser.execute(() => document.documentElement.classList.contains("dark"));
    const directory = resolve("e2e", ".artifacts");
    await mkdir(directory, { recursive: true });
    const backgrounds: Record<string, string> = {};
    try {
      for (const theme of ["light", "dark"]) {
        await browser.execute((dark) => document.documentElement.classList.toggle("dark", dark), theme === "dark");
        const layout = await browser.execute(() => {
          const toolbar = document.querySelector<HTMLElement>(".htnote-media-image .htnote-media-toolbar")!;
          const image = document.querySelector<HTMLElement>(".tiptap img")!;
          const editor = document.querySelector<HTMLElement>(".htnote-visual-editor .tiptap")!;
          const toolbarRect = toolbar.getBoundingClientRect();
          const imageRect = image.getBoundingClientRect();
          const style = getComputedStyle(toolbar);
          return {
            background: style.backgroundColor,
            color: style.color,
            aboveImage: toolbarRect.bottom <= imageRect.top,
            withinEditor: toolbarRect.top >= editor.getBoundingClientRect().top,
            outline: getComputedStyle(image).outlineWidth,
          };
        });
        assert.equal(layout.aboveImage, true);
        assert.equal(layout.withinEditor, true);
        assert.ok(layout.outline === "2px" || layout.outline === "1.6px", `Expected outline width 2px (or 1.6px at 125% DPI), got ${layout.outline}`);
        assert.equal(layout.color, theme === "dark" ? "rgb(241, 245, 249)" : "rgb(17, 24, 39)");
        backgrounds[theme] = layout.background;
        await browser.saveScreenshot(resolve(directory, `media-toolbar-${theme}.png`));
      }
      assert.ok(backgrounds.light);
      assert.ok(backgrounds.dark);
      assert.notEqual(backgrounds.light, backgrounds.dark);
    } finally {
      await browser.execute((dark) => document.documentElement.classList.toggle("dark", dark), themeWasDark);
    }
    await $('.htnote-media-image .htnote-media-toolbar button[aria-label="Ortala"], .htnote-media-image .htnote-media-toolbar button[aria-label="Align center"]').click();
    assert.equal(await $(".htnote-media-node").getAttribute("data-align"), "center");
    await clickMediaGap(".tiptap img[alt='Preview']", "left");
    await clickMediaGap(".tiptap img[alt='Preview']", "right");
    await $(".tiptap img[alt='Preview']").click();
    await $(".htnote-media-image .htnote-media-toolbar").waitForDisplayed();
    await $('.htnote-media-image .htnote-media-toolbar button[aria-label="Sağa hizala"], .htnote-media-image .htnote-media-toolbar button[aria-label="Align right"]').click();
    assert.equal(await $(".htnote-media-node").getAttribute("data-align"), "right");
    await clickMediaGap(".tiptap img[alt='Preview']", "left");
    await saveShortcut();
    const saved = await invoke<{ html: string }>("read_note", { id: note.id });
    assert.match(saved.html, /data-align="right"/);
    await browser.keys(["Control", "e"]);
    await $('[data-testid="edit-note"]').waitForDisplayed();
    await withNoteFrame(note.id, async () => {
      const layout = await browser.execute(() => {
        const image = document.querySelector<HTMLImageElement>('img[alt="Preview"]')!;
        const style = getComputedStyle(image);
        return { align: image.dataset.align, display: style.display, right: style.marginRight };
      });
      assert.equal(layout.align, "right");
      assert.equal(layout.display, "block");
      assert.equal(layout.right, "0px");
    });
    await editNote();
    assert.equal(await $(".htnote-media-node").getAttribute("data-align"), "right");
    await clickMediaGap(".tiptap img[alt='Preview']", "left");
    await browser.keys("Gap text");
    await browser.waitUntil(async () => browser.execute(() => document.querySelector(".tiptap > p")?.textContent === "Gap text"));
    assert.equal(await browser.execute(() => document.querySelector(".tiptap")!.firstElementChild!.tagName), "P");
    assert.equal(await $$(".tiptap img").length, 2);
  });
});
