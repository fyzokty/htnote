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
