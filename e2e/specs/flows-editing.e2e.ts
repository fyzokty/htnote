import assert from "node:assert/strict";
import { join } from "node:path";

import { pointerMoveTo } from "../helpers/pointer";

import { visibleEditorTool, createNote, editNote, flatten, invoke, openNote, saveAndView, saveShortcut, tree, typeInVisualEditor, useTempRoot, waitForFile, withNoteFrame } from "../helpers/flows";

describe("editing flows", () => {
  let restore: (() => Promise<void>) | undefined;
  let root: string;

  beforeEach(async () => { ({ root, restore } = await useTempRoot()); });
  afterEach(async () => { await restore?.(); });

  it("matches compact semantic paragraph spacing and empty line height in the viewer", async () => {
    const note = await createNote("Paragraph spacing");
    await openNote(note.id);
    await editNote();
    await $(".tiptap").click();
    await browser.keys(["Control", "a"]);
    await browser.keys("first");
    await browser.keys("Enter");
    await browser.keys("second");
    await browser.keys("Enter");
    await browser.keys("Enter");
    await browser.keys("last");
    const measure = (selector: string) => {
      const paragraphs = Array.from(document.querySelectorAll<HTMLElement>(`${selector} > p`));
      return paragraphs.map((p) => {
        const style = getComputedStyle(p);
        return { margin: parseFloat(style.marginTop) / parseFloat(style.fontSize),
          line: parseFloat(style.lineHeight) / parseFloat(style.fontSize),
          height: p.getBoundingClientRect().height / parseFloat(style.fontSize) };
      });
    };
    const editor = await browser.execute(measure, ".tiptap");
    assert.equal(editor.length, 4);
    const saved = await saveAndView(note.id, (html) => html.includes("last"));
    assert.match(saved, /<p><\/p>/);
    await withNoteFrame(note.id, async () => {
      const viewer = await browser.execute(measure, "#htnote-content");
      assert.equal(viewer.length, 4);
      for (let i = 0; i < viewer.length; i++) {
        assert.ok(Math.abs(viewer[i].margin - editor[i].margin) < 0.02);
        assert.ok(Math.abs(viewer[i].line - editor[i].line) < 0.02);
        assert.ok(Math.abs(viewer[i].height - editor[i].height) < 0.02);
      }
    });
  });

  it("keeps real Enter keystrokes in one code block after save and reopen", async () => {
    const note = await createNote("Code Enter");
    await openNote(note.id);
    await editNote();
    const surface = await $(".htnote-visual-editor .tiptap");
    await surface.click();
    await browser.keys(["Control", "a"]);
    await browser.keys("first");
    const codeTool = await visibleEditorTool('.htnote-editor-toolbar button[aria-label="Kod bloğu"]');
    await codeTool.click();
    await browser.keys("End");
    await browser.keys("Enter");
    await browser.keys("  second");
    await browser.keys("Enter");
    await browser.keys("third");
    assert.equal(await surface.$$("pre").length, 1);
    assert.equal(await surface.$("pre code").getText(), "first\n  second\nthird");
    const saved = await saveAndView(note.id, (html) => html.includes("third"));
    assert.match(saved, /<pre><code>first\n  second\nthird<\/code><\/pre>/);
    await withNoteFrame(note.id, async () => {
      assert.equal(await $("#htnote-content pre code").getText(), "first\n  second\nthird");
    });
    await editNote();
    assert.equal(await $(".tiptap pre code").getText(), "first\n  second\nthird");
    await $(".tiptap pre code").click();
    await browser.keys(["Control", "End"]);
    await browser.keys(["Control", "Enter"]);
    await browser.keys("after code");
    assert.equal(await $(".tiptap > p:last-child").getText(), "after code");
  });

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
    const counts = $('[data-testid="note-counts"]');
    await counts.waitForDisplayed();
    const countText = await counts.getText();
    assert.match(countText, /[1-9][\d,.]* (?:words?|kelime)\s*·\s*[1-9][\d,.]* (?:characters?|karakter)/i);
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
    await code.waitForDisplayed();
    await code.click();
    await browser.keys(["Control", "a"]);
    await code.addValue(html);
    await browser.waitUntil(async () => (await code.getText()).includes('<button id="counter">0</button>'),
      { timeoutMsg: "Counter source did not appear in the code editor" });
    const savedCode = await saveAndView(note.id, (saved) => saved.includes('<button id="counter">0</button>')
      && saved.includes('addEventListener("click"'));
    assert.ok(savedCode.includes('<button id="counter">0</button>'));
    await withNoteFrame(note.id, async () => {
      const button = await $("#counter");
      await button.waitForDisplayed();
      await button.click();
      assert.equal(await button.getText(), "1");
    });
    await editNote();
    await typeInVisualEditor("Visual addition");
    await browser.waitUntil(async () => (await $('.htnote-visual-editor .tiptap').getText()).includes("Visual addition"));
    const savedVisual = await saveAndView(note.id, (saved) => saved.includes("Visual addition"));
    assert.ok(savedVisual.includes('<button id="counter">0</button>'));
    assert.ok(savedVisual.includes('addEventListener("click"'));
    await withNoteFrame(note.id, async () => {
      const button = await $("#counter");
      await button.waitForDisplayed();
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
          const toolbar = document.querySelector(".htnote-editor-toolbar")!;
          return { scrollHeight: scroll.clientHeight, surfaceHeight: surface.getBoundingClientRect().height,
            toolbarHeight: toolbar.getBoundingClientRect().height + parseFloat(getComputedStyle(toolbar).marginTop),
            overflow: getComputedStyle(scroll).overflowY };
        });
        assert.ok(visualLayout.scrollHeight > 100);
        assert.ok(visualLayout.surfaceHeight + visualLayout.toolbarHeight >= visualLayout.scrollHeight - 1);
        assert.equal(visualLayout.overflow, "auto");
        const undo = await visibleEditorTool('.htnote-editor-toolbar button[aria-label="Geri al"]');
        await pointerMoveTo(await undo.$("svg"));
        await $('[role="tooltip"]').waitForDisplayed();
        assert.ok((await $('[role="tooltip"]').getText()).includes("Ctrl+Z"));
        assert.equal(await browser.execute(() => getComputedStyle(document.querySelector(".htnote-editor-toolbar")!).position), "sticky");
        const overflow = await $('[data-testid="editor-overflow"]');
        if (await overflow.isExisting() && await overflow.getAttribute("aria-expanded") === "true") await overflow.click();
        assert.equal(await $('[data-testid="note-header"] [data-testid="save-note"]').isDisplayed(), true);
        assert.equal(await $(".htnote-session-bar").isExisting(), false);
        await pointerMoveTo(await $('[data-testid="save-note"] svg'));
        await browser.waitUntil(async () => (await $('[role="tooltip"]').getText()).includes("Ctrl+S"));
        assert.notEqual(await browser.execute(() => getComputedStyle(document.querySelector('[data-testid="save-note"]')!).backgroundColor), "rgba(0, 0, 0, 0)");
        await $('[data-testid="code-mode"]').click();
        assert.equal(await $('[data-testid="code-mode"]').getAttribute("aria-pressed"), "true");
        await $('[data-testid="live-preview"][data-loaded="true"]').waitForDisplayed();
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
        // CodeMirror only renders viewport lines. CI's smaller viewport leaves
        // the main element below the rendered range even after formatting.
        await browser.keys(["Control", "End"]);
        await browser.waitUntil(async () => /<main id="htnote-content">\s*\n\s*<h1>/.test(
          await $('.htnote-code-host .cm-content').getText()),
        { timeoutMsg: "Formatted note content did not appear in the code viewport" });
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
    await pointerMoveTo(tab);
    await tab.$("button svg").waitForDisplayed();
    assert.equal(await dot.isDisplayed(), false);
    await $(`[data-note-id="${note.id}"] button`).click();
    await $('[role="dialog"] [data-testid="discard-changes"]').waitForDisplayed();
    await $('[data-testid="discard-changes"]').click();
    await browser.waitUntil(async () => !await $(`[data-note-id="${note.id}"]`).isExisting());
  });

  it("clears overflow tooltips after closing a narrow visual toolbar", async () => {
    const size = await browser.getWindowSize();
    const settings = await invoke<{ editorLivePreview: boolean; sidebarVisible: boolean }>("get_settings");
    try {
      await browser.setWindowSize(900, 600);
      await invoke("update_settings", { patch: { editorLivePreview: true, sidebarVisible: true } });
      await browser.refresh();
      const note = await createNote("Overflow tooltip");
      await openNote(note.id);
      await editNote();
      const overflow = await $('[data-testid="editor-overflow"]');
      await overflow.waitForDisplayed();
      await overflow.click();
      await $('.htnote-toolbar-overflow[data-open="true"]').waitForDisplayed();
      const table = await $('.htnote-toolbar-overflow button[aria-label="Tablo ekle"]');
      await table.waitForDisplayed();
      await pointerMoveTo(await table.$("svg"));
      await $('[role="tooltip"]').waitForDisplayed();
      assert.equal(await $('[role="tooltip"]').getText(), "Tablo ekle");
      // Outside pointerdown closes the panel, including a hovered tooltip whose
      // anchor can become inert without receiving mouseleave or blur.
      await $('.htnote-visual-editor .tiptap').click();
      await browser.waitUntil(async () => await overflow.getAttribute("aria-expanded") === "false");
      await browser.waitUntil(async () => await browser.execute(() => document.querySelectorAll('[role="tooltip"]').length) === 0);
      await overflow.click();
      await overflow.click();
      await pointerMoveTo(await $('.htnote-visual-editor .tiptap'));
      // Include the hover delay to detect a pending timer resurrecting a tip.
      await browser.executeAsync((done) => setTimeout(done, 450));
      assert.equal(await browser.execute(() => document.querySelectorAll('[role="tooltip"]').length), 0);
    } finally {
      await browser.setWindowSize(size.width, size.height);
      await invoke("update_settings", { patch: { editorLivePreview: settings.editorLivePreview, sidebarVisible: settings.sidebarVisible } });
    }
  });
});
