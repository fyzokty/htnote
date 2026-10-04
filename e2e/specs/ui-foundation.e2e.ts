import assert from "node:assert/strict";

import { createNote, invoke, openNote, useTempRoot, withNoteFrame } from "../helpers/flows";

describe("shared UI foundation", () => {
  let restore: (() => Promise<void>) | undefined;
  let theme: string;
  beforeEach(async () => {
    theme = (await invoke<{ theme: string }>("get_settings")).theme;
    ({ restore } = await useTempRoot());
  });
  afterEach(async () => {
    await invoke("update_settings", { patch: { theme } });
    await restore?.();
  });

  it("blocks native context menus while preserving editing, copying and custom menus", async () => {
    const note = await createNote("Context menu guard");
    await openNote(note.id);
    const checkGuard = () => {
      const fixture = document.createElement("div");
      fixture.innerHTML = '<div data-blank></div><input type="text"><textarea></textarea><div contenteditable="true"><span data-editable>Editable</span></div><div class="cm-editor"><span data-code>Code</span></div><p><strong>Selected text</strong></p><video></video>';
      document.body.append(fixture);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      const dispatch = (selector: string) => {
        const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        fixture.querySelector(selector)!.dispatchEvent(event);
        return event.defaultPrevented;
      };
      try {
        const state = {
          blank: dispatch("[data-blank]"),
          input: dispatch("input"),
          textarea: dispatch("textarea"),
          editable: dispatch("[data-editable]"),
          code: dispatch("[data-code]"),
          selected: true,
          unrelated: false,
        };
        const range = document.createRange();
        range.selectNodeContents(fixture.querySelector("strong")!);
        selection.addRange(range);
        state.selected = dispatch("p");
        state.unrelated = dispatch("[data-blank]");
        return state;
      } finally {
        selection.removeAllRanges();
        fixture.remove();
      }
    };
    const expected = { blank: true, input: false, textarea: false, editable: false, code: false, selected: false, unrelated: true };
    assert.deepEqual(await browser.execute(checkGuard), expected);
    await withNoteFrame(note.id, async () => {
      assert.deepEqual(await browser.execute(checkGuard), expected);
      assert.equal(await browser.execute(() => {
        const video = document.createElement("video");
        document.body.append(video);
        const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        video.dispatchEvent(event);
        video.remove();
        return event.defaultPrevented;
      }), true);
    });
    assert.equal(await browser.execute((id: string) => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 100, clientY: 150 });
      document.querySelector(`[data-tree-key="note:${id}"]`)!.dispatchEvent(event);
      return event.defaultPrevented;
    }, note.id), true);
    await $('[role="menu"]').waitForDisplayed();
    await $("aside h1").click();
    await $('[role="menu"]').waitForExist({ reverse: true });
    await $('[data-testid="edit-note"]').click();
    await $(".htnote-visual-editor .tiptap").waitForDisplayed();
    assert.equal(await browser.execute(() => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      document.querySelector(".htnote-visual-editor .tiptap")!.dispatchEvent(event);
      return event.defaultPrevented;
    }), false);
    await $('[data-testid="code-mode"]').click();
    await $(".cm-content").waitForDisplayed();
    assert.equal(await browser.execute(() => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      document.querySelector(".cm-content")!.dispatchEvent(event);
      return event.defaultPrevented;
    }), false);
    await $('[data-testid="live-preview"][data-loaded="true"]').waitForDisplayed();
    const preview = await $('[data-testid="live-preview"] iframe');
    assert.ok((await preview.getAttribute("src"))?.includes("/__draft/"));
    try {
      await browser.switchFrame(preview);
      assert.deepEqual(await browser.execute(checkGuard), expected);
    } finally {
      await browser.switchFrame(null);
    }
  });

  it("preserves text selection and themed scrollbars in both modes", async () => {
    const note = await createNote("UI foundation");
    for (const mode of ["light", "dark"]) {
      await invoke("update_settings", { patch: { theme: mode } });
      await browser.refresh();
      await openNote(note.id);
      const state = await browser.execute((id: string, themeMode: string) => {
        const row = document.querySelector<HTMLElement>(`[data-tree-key="note:${id}"]`)!;
        const input = document.querySelector<HTMLInputElement>('aside input[type="search"]')!;
        const root = getComputedStyle(document.documentElement);
        return {
          headingSelection: getComputedStyle(document.querySelector("aside h1")!).userSelect,
          rowSelection: getComputedStyle(row).userSelect,
          inputSelection: getComputedStyle(input).userSelect,
          scrollbar: getComputedStyle(document.querySelector('[role="tree"]')!).scrollbarWidth,
          thumb: root.getPropertyValue(`--app-scrollbar-${themeMode}`).trim(),
        };
      }, note.id, mode);
      assert.equal(state.headingSelection, "none");
      assert.equal(state.rowSelection, "none");
      assert.equal(state.inputSelection, "text");
      assert.equal(state.scrollbar, "thin");
      await withNoteFrame(note.id, async () => {
        await browser.waitUntil(async () => await $("html").getAttribute("data-ht-theme") === mode);
        assert.equal(await browser.execute(() => getComputedStyle(document.documentElement).scrollbarWidth), "thin");
        assert.equal(await browser.execute(() => document.documentElement.style.getPropertyValue("--ht-scrollbar")), state.thumb);
        assert.equal(await browser.execute(() => {
          const style = document.createElement("style");
          style.textContent = ".author-scroll { scrollbar-width: auto; }";
          document.head.append(style);
          const div = document.createElement("div");
          div.className = "author-scroll";
          document.body.append(div);
          const value = getComputedStyle(div).scrollbarWidth;
          div.remove();
          style.remove();
          return value;
        }), "auto");
      });
    }
    await $('[data-testid="edit-note"]').click();
    await $('[data-testid="code-mode"]').click();
    await $(".cm-scroller").waitForExist();
    const editor = await browser.execute(() => ({
      selection: getComputedStyle(document.querySelector(".cm-content")!).userSelect,
      scrollbar: getComputedStyle(document.querySelector(".cm-scroller")!).scrollbarWidth,
    }));
    assert.deepEqual(editor, { selection: "text", scrollbar: "thin" });
  });

  it("shows the close tooltip on keyboard focus and dismisses it with Escape", async () => {
    const note = await createNote("Tooltip check");
    await openNote(note.id);
    const button = await $(`[data-note-id="${note.id}"] button`);
    assert.equal(await button.getAttribute("title"), null);
    // Önce klavye kullanımına geç; focus-visible önceki testin fare durumuna bağlı kalmasın.
    await browser.keys("Tab");
    await browser.execute((id: string) => {
      document.querySelector<HTMLButtonElement>(`[data-note-id="${id}"] button`)!.focus();
    }, note.id);
    await $('[role="tooltip"]').waitForDisplayed();
    assert.ok(await button.getAttribute("aria-describedby"));
    assert.ok((await $('[role="tooltip"]').getText()).includes("Ctrl+W"));
    await browser.keys("Escape");
    await $('[role="tooltip"]').waitForExist({ reverse: true });
  });
});
