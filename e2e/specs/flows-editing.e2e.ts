import assert from "node:assert/strict";
import { join } from "node:path";

import { createNote, editNote, flatten, invoke, openNote, saveShortcut, tree, typeInVisualEditor, useTempRoot, waitForFile, withNoteFrame } from "../helpers/flows";

describe("editing flows", () => {
  let restore: (() => Promise<void>) | undefined;
  let root: string;

  beforeEach(async () => { ({ root, restore } = await useTempRoot()); });
  afterEach(async () => { await restore?.(); });

  it("creates, saves and displays a visual note", async () => {
    await $('[data-testid="new-note"]').click();
    await browser.waitUntil(async () => flatten(await tree()).length === 1);
    const note = flatten(await tree())[0];
    await editNote();
    await typeInVisualEditor("Visual smoke content");
    await saveShortcut();
    await waitForFile(join(root, note.relPath, "index.html"), (bytes) => bytes.toString().includes("Visual smoke content"));
    await browser.keys(["Control", "e"]);
    await $('[data-testid="edit-note"]').waitForDisplayed();
    await withNoteFrame(note.id, async () => {
      assert.match(await $("#htnote-content").getText(), /Visual smoke content/);
    });
  });

  it("keeps a script counter working after a visual edit", async () => {
    const note = await createNote("Counter");
    await openNote(note.id);
    await editNote();
    await $('[data-testid="code-mode"]').click();
    const base = await invoke<{ html: string }>("read_note", { id: note.id });
    const html = base.html.replace("</body>", '<button id="counter">0</button><script>document.getElementById("counter").addEventListener("click", function () { this.textContent = String(Number(this.textContent) + 1); });</script></body>');
    const code = await $(".htnote-code-host .cm-content");
    await code.click();
    await browser.keys(["Control", "a"]);
    await code.addValue(html);
    await $('[data-testid="save-note"]').click();
    await withNoteFrame(note.id, async () => {
      const button = await $("#counter");
      await button.click();
      assert.equal(await button.getText(), "1");
    });
    await editNote();
    await typeInVisualEditor("Visual addition");
    await $('[data-testid="save-note"]').click();
    await withNoteFrame(note.id, async () => {
      const button = await $("#counter");
      await button.click();
      assert.equal(await button.getText(), "1");
      assert.match(await $("#htnote-content").getText(), /Visual addition/);
    });
  });

  it("shows icon tooltips and accessible code tabs with a persistent preview toggle in both themes", async () => {
    const settings = await invoke<{ theme: string; editorLivePreview: boolean }>("get_settings");
    const note = await createNote("Editor controls");
    const original = await invoke<{ html: string }>("read_note", { id: note.id });
    assert.match(original.html, /<main id="htnote-content">\n {6}<h1>/);
    try {
      for (const theme of ["light", "dark"]) {
        await invoke("update_settings", { patch: { theme, editorLivePreview: true } });
        await browser.refresh();
        await openNote(note.id);
        await editNote();
        const visual = await $('[data-testid="visual-mode"]');
        assert.equal(await visual.getAttribute("aria-pressed"), "true");
        const visualLayout = await browser.execute(() => {
          const scroll = document.querySelector(".htnote-visual-scroll")!;
          const surface = document.querySelector(".htnote-visual-editor .tiptap")!;
          return { scrollHeight: scroll.clientHeight, surfaceHeight: surface.getBoundingClientRect().height,
            overflow: getComputedStyle(scroll).overflowY };
        });
        assert.ok(visualLayout.scrollHeight > 100);
        assert.ok(visualLayout.surfaceHeight >= visualLayout.scrollHeight - 1);
        assert.equal(visualLayout.overflow, "auto");
        await $('.htnote-editor-toolbar button[aria-label] svg').moveTo();
        await $('[role="tooltip"]').waitForDisplayed();
        assert.ok((await $('[role="tooltip"]').getText()).includes("Ctrl+Z"));
        assert.equal(await browser.execute(() => getComputedStyle(document.querySelector(".htnote-editor-toolbar")!).position), "sticky");
        await $('[data-testid="save-note"] svg').moveTo();
        await browser.waitUntil(async () => (await $('[role="tooltip"]').getText()).includes("Ctrl+S"));
        assert.notEqual(await browser.execute(() => getComputedStyle(document.querySelector('[data-testid="save-note"]')!).backgroundColor), "rgba(0, 0, 0, 0)");
        await $('[data-testid="code-mode"]').click();
        assert.equal(await $('[data-testid="code-mode"]').getAttribute("aria-pressed"), "true");
        const html = await $('[data-testid="code-tab-html"]');
        const css = await $('[data-testid="code-tab-css"]');
        assert.equal(await html.getAttribute("aria-selected"), "true");
        const codeLayout = await browser.execute(() => {
          const host = document.querySelector(".htnote-code-host")!;
          const editor = host.querySelector(".cm-editor")!;
          return { hostHeight: host.clientHeight, editorHeight: editor.getBoundingClientRect().height,
            hostOverflow: getComputedStyle(host).overflowY,
            outerOverflow: getComputedStyle(document.querySelector(".htnote-split-editor")!).overflowY,
            scrollerOverflow: getComputedStyle(editor.querySelector(".cm-scroller")!).overflowY,
            wrapping: !!editor.querySelector(".cm-lineWrapping") };
        });
        assert.ok(codeLayout.hostHeight > 100);
        assert.ok(Math.abs(codeLayout.hostHeight - codeLayout.editorHeight) <= 1);
        assert.equal(codeLayout.hostOverflow, "hidden");
        assert.equal(codeLayout.outerOverflow, "hidden");
        assert.equal(codeLayout.scrollerOverflow, "auto");
        assert.equal(codeLayout.wrapping, true);
        const formatter = await $('[data-testid="format-document"]');
        assert.equal(await formatter.isEnabled(), true);
        await formatter.click();
        const formattedHtml = await $('.htnote-code-host .cm-content').getText();
        assert.match(formattedHtml, /<main id="htnote-content">\s*\n\s*<h1>/);
        await browser.keys(["Control", "z"]);
        await html.click();
        await browser.keys("ArrowRight");
        assert.equal(await css.getAttribute("aria-selected"), "true");
        assert.equal(await formatter.isEnabled(), false);
        assert.equal(await html.getAttribute("aria-selected"), "false");
        assert.equal(await browser.execute(() => document.activeElement?.getAttribute("data-testid")), "code-tab-css");
        assert.notEqual(await browser.execute(() => getComputedStyle(document.querySelector('[data-testid="code-tab-css"]')!, "::after").backgroundColor), "rgba(0, 0, 0, 0)");
        const toggle = await $('[data-testid="live-preview-toggle"]');
        assert.equal(await toggle.getAttribute("aria-pressed"), "true");
        assert.equal(await browser.execute(() => !!document.querySelector('.htnote-code-bar [data-testid="live-preview-toggle"]')), true);
        await toggle.click();
        await browser.waitUntil(async () => !(await invoke<{ editorLivePreview: boolean }>("get_settings")).editorLivePreview);
        assert.equal(await toggle.getAttribute("aria-pressed"), "false");
        assert.equal(await $('.htnote-split-view [role="separator"]').isExisting(), false);
        await toggle.click();
        await browser.waitUntil(async () => (await invoke<{ editorLivePreview: boolean }>("get_settings")).editorLivePreview);
        assert.equal(await toggle.getAttribute("aria-pressed"), "true");
      }
    } finally {
      await invoke("update_settings", { patch: { theme: settings.theme, editorLivePreview: settings.editorLivePreview } });
    }
  });

  it("discards a dirty tab on close", async () => {
    const note = await createNote("Dirty");
    await openNote(note.id);
    await editNote();
    await typeInVisualEditor("Unsaved change");
    const tab = await $(`[role="tab"][data-note-id="${note.id}"]`);
    const dot = await tab.$('[data-testid="tab-dirty"]');
    await dot.waitForDisplayed();
    await tab.moveTo();
    await tab.$("button svg").waitForDisplayed();
    assert.equal(await dot.isDisplayed(), false);
    await $(`[data-note-id="${note.id}"] button`).click();
    await $('[role="dialog"] [data-testid="discard-changes"]').waitForDisplayed();
    await $('[data-testid="discard-changes"]').click();
    await browser.waitUntil(async () => !await $(`[data-note-id="${note.id}"]`).isExisting());
  });
});
