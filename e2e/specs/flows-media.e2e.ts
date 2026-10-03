import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Editor } from "@tiptap/core";
import type { MediaClickDebug } from "../../src/features/editor/mediaSelection";

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

const mediaClickDiagnostics: object[] = [];

async function clickMediaGap(selector: string, side: "left" | "right" = "right") {
  const origin = await $(selector);
  await origin.scrollIntoView();
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
    // WebDriver offsets are relative to the element's in-view center, rounded
    // down by the protocol. Use the same center when computing the offsets.
    const centerX = Math.floor((Math.max(0, media.left) + Math.min(window.innerWidth, media.right)) / 2);
    const centerY = Math.floor((Math.max(0, media.top) + Math.min(window.innerHeight, media.bottom)) / 2);
    const x = Math.round(side === "right" ? editor.right - 8 : editor.left + 8);
    return {
      x, y: centerY,
      offsetX: x - centerX, offsetY: 0,
      edge: side === "right" ? media.right : media.left,
      boundaries,
    };
  }, selector, side);
  await browser.execute(() => { window.__htnoteDebugMediaClick = { calls: 0 }; });
  const snapshot = () => browser.execute((selector, point) => {
    const surface = document.querySelector(".tiptap") as HTMLElement & { editor: Editor };
    const preview = document.querySelector(selector);
    const describe = (element: Element | null) => element ? {
      tag: element.tagName, className: element.getAttribute("class") ?? "",
    } : null;
    const layout = (element: Element | null) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return { ...describe(element), rect: element.getBoundingClientRect().toJSON(), display: style.display, width: style.width };
    };
    const node = (value: Node | null) => value ? {
      // Avoid nodeType: EdgeDriver mistakes that property on a plain summary
      // object for a live DOM node and returns a stale element reference.
      nodeName: value.nodeName, domNodeType: value.nodeType,
      element: describe(value instanceof Element ? value : value.parentElement),
      text: value.nodeType === Node.TEXT_NODE ? value.textContent?.slice(0, 80) : null,
    } : null;
    const selection = window.getSelection();
    let posAtCoords: object | null = null;
    let posAtCoordsError: string | null = null;
    try { posAtCoords = surface.editor.view.posAtCoords({ left: point.x, top: point.y }); }
    catch (error) { posAtCoordsError = String(error); }
    return {
      userAgent: navigator.userAgent,
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      scroll: { x: window.scrollX, y: window.scrollY }, activeElement: describe(document.activeElement),
      editor: layout(surface), mediaNode: layout(preview?.closest(".htnote-media-node") ?? null),
      preview: layout(preview), wrapper: layout(preview?.closest(".htnote-media-preview") ?? null),
      elementFromPoint: describe(document.elementFromPoint(point.x, point.y)),
      posAtCoords, posAtCoordsError,
      domSelection: selection ? {
        anchorNode: node(selection.anchorNode), anchorOffset: selection.anchorOffset,
        focusNode: node(selection.focusNode), focusOffset: selection.focusOffset,
        isCollapsed: selection.isCollapsed,
      } : null,
      proseMirrorSelection: surface.editor.state.selection.toJSON() as { type: string; pos?: number },
      handler: window.__htnoteDebugMediaClick as MediaClickDebug | undefined,
    };
  }, selector, point);
  const diagnostics = {
    selector, side, point, clickMethod: "WebDriver performActions (element origin, real mouse pointerDown/pointerUp; no synthetic dispatchEvent)",
    before: await snapshot(),
    afterMousedown: null as Awaited<ReturnType<typeof snapshot>> | null,
    afterMouseup: null as Awaited<ReturnType<typeof snapshot>> | null,
  };
  const message = (text: string) => `${text}\nMedia click diagnostics: ${JSON.stringify(diagnostics)}`;
  try {
    assert.ok(side === "right" ? point.x > point.edge : point.x < point.edge, message("Click must be outside the media preview"));
    assert.equal(point.boundaries.length, 2, message("Clicked media must have two boundaries"));
    await browser.performActions([{ type: "pointer", id: "media-gap", parameters: { pointerType: "mouse" }, actions: [
      { type: "pointerMove", origin: { "element-6066-11e4-a52e-4f735466cecf": origin.elementId },
        x: point.offsetX, y: point.offsetY }, { type: "pointerDown", button: 0 },
    ] }]);
    // WebView2 versions can resolve the same outside point to either adjacent
    // gap. Both are valid, but selecting the atom or a distant gap is a failure.
    diagnostics.afterMousedown = await snapshot();
    const down = diagnostics.afterMousedown.proseMirrorSelection;
    await browser.performActions([{ type: "pointer", id: "media-gap", parameters: { pointerType: "mouse" }, actions: [
      { type: "pointerUp", button: 0 },
    ] }]);
    // Capture mouseup even when the saved mousedown selection fails, so the
    // failure includes both phases without changing either expectation.
    diagnostics.afterMouseup = await snapshot();
    const actual = diagnostics.afterMousedown.handler?.last;
    assert.ok(actual, message("Outside mousedown must reach the media diagnostic hook"));
    const dx = actual.x - point.x;
    const dy = actual.y - point.y;
    assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1,
      message(`WebDriver pointer coordinate drift: expected (${point.x}, ${point.y}), received (${actual.x}, ${actual.y}), offset (${dx}, ${dy})`));
    // Selection can hide a toolbar or scroll the editor. Validate against the
    // handler's bounds at event time, before those layout changes occur.
    const clickedRow = actual.rows.find(({ pos }) => pos === point.boundaries[0]);
    const row = clickedRow?.row;
    const preview = clickedRow?.preview;
    assert.ok(row && preview && actual.y >= row.top && actual.y <= row.bottom
      && (side === "right" ? actual.x > preview.right : actual.x < preview.left),
      message(`WebDriver click missed the intended media row: received (${actual.x}, ${actual.y})`));
    assert.equal(down.type, "gapcursor", message("Outside mousedown must place a gap cursor, not select media"));
    assert.ok(down.pos !== undefined && point.boundaries.includes(down.pos),
      message(`Outside mousedown must use a boundary of the clicked media (${point.boundaries}), got ${down.pos}`));
    assert.deepEqual(diagnostics.afterMouseup.proseMirrorSelection, down, message("Outside mouseup must keep the cursor at the same media boundary"));
    await browser.waitUntil(async () => browser.execute(() => !document.querySelector(".htnote-media.is-selected")),
      { timeout: 5000, timeoutMsg: message("Outside click left a media preview selected") });
  } finally {
    try {
      mediaClickDiagnostics.push(diagnostics);
      const directory = resolve("e2e", "logs");
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, "media-click-diagnostics.json"), JSON.stringify(mediaClickDiagnostics, null, 2));
    } finally {
      try { await browser.releaseActions(); }
      finally { await browser.execute(() => { delete window.__htnoteDebugMediaClick; }); }
    }
  }
}

describe("visual media previews", () => {
  let restore: (() => Promise<void>) | undefined;
  beforeEach(async () => { ({ restore } = await useTempRoot()); });
  afterEach(async () => { await restore?.(); });

  it("loads relative images and direct/nested audio/video sources without autoplay", async () => {
    mediaClickDiagnostics.length = 0;
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
