import assert from "node:assert/strict";
import { createNote, editNote, invoke, openNote, useTempRoot, withNoteFrame } from "../helpers/flows";

describe("note colors", () => {
  let restore: (() => Promise<void>) | undefined;
  let settings: { theme: string; language: string | null; tagColors: Record<string, string> };

  beforeEach(async () => {
    settings = await invoke("get_settings");
    await invoke("update_settings", { patch: { language: "en" } });
    ({ restore } = await useTempRoot());
  });
  afterEach(async () => {
    await invoke("update_settings", { patch: { theme: settings.theme, language: settings.language, tagColors: settings.tagColors } });
    await restore?.();
  });

  it("shares theme surfaces and persists background and text colors through editor modes", async () => {
    const note = await createNote("Colors");
    for (const theme of ["light", "dark"]) {
      await invoke("update_settings", { patch: { theme } });
      await browser.refresh();
      await openNote(note.id);
      const surface = await browser.execute(() => {
        const style = getComputedStyle(document.documentElement);
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--app-surface)";
        probe.style.color = "var(--app-text)";
        document.body.append(probe);
        const result = { bg: getComputedStyle(probe).backgroundColor, text: getComputedStyle(probe).color, mode: style.colorScheme };
        probe.remove();
        return result;
      });
      await withNoteFrame(note.id, async () => {
        await browser.waitUntil(async () => await browser.execute((mode) => document.documentElement.dataset.htTheme === mode, theme));
        assert.equal(await browser.execute(() => getComputedStyle(document.body).backgroundColor), surface.bg);
        assert.equal(await browser.execute(() => getComputedStyle(document.body).color), surface.text);
      });
    }
    await $('button[aria-label="Appearance"]').click();
    await $('[role="dialog"] button[aria-label="Paper / Sepia"]').click();
    await browser.waitUntil(async () => (await invoke<{ html: string }>("read_note", { id: note.id })).html.includes('data-ht-bg="sepia"'));
    await $('[data-testid="edit-note"]').waitForDisplayed();
    await withNoteFrame(note.id, async () => {
      await browser.waitUntil(async () => await $("body").getAttribute("data-ht-bg") === "sepia");
      assert.equal(await browser.execute(() => getComputedStyle(document.body).backgroundColor), "rgb(48, 43, 35)");
    });
    await editNote();
    assert.equal(await browser.execute(() => getComputedStyle(document.querySelector(".htnote-visual-scroll")!).backgroundColor), "rgb(48, 43, 35)");
    const editor = await $(".tiptap");
    await editor.click();
    await browser.keys(["Control", "a"]);
    await $('button[aria-label="Text color"]').click();
    await browser.execute(() => {
      const input = document.querySelector<HTMLInputElement>('[role="dialog"] input[type="color"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "#3266bb");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.equal(await browser.execute(() => getComputedStyle(document.querySelector(".tiptap h1 span")!).color), "rgb(50, 102, 187)");
    await $('[data-testid="code-mode"]').click();
    // CodeMirror virtualizes off-screen lines; the appearance CSS pushes main below the initial viewport.
    await $(".cm-content").click();
    await browser.keys(["Control", "End"]);
    await browser.waitUntil(async () => (await $(".cm-content").getText()).includes('<main id="htnote-content">'));
    assert.match(await $(".cm-content").getText(), /color:\s*(#3266bb|rgb\(50, 102, 187\))/);
    await $('[data-testid="visual-mode"]').click();
    assert.equal(await browser.execute(() => getComputedStyle(document.querySelector(".tiptap h1 span")!).color), "rgb(50, 102, 187)");
    await $('[data-testid="save-note"]').click();
    await browser.waitUntil(async () => /color:\s*(#3266bb|rgb\(50, 102, 187\))/.test((await invoke<{ html: string }>("read_note", { id: note.id })).html));
    await browser.refresh();
    await openNote(note.id);
    await withNoteFrame(note.id, async () => {
      assert.equal(await $("body").getAttribute("data-ht-bg"), "sepia");
      assert.equal(await browser.execute(() => getComputedStyle(document.body).backgroundColor), "rgb(48, 43, 35)");
      assert.equal(await browser.execute(() => getComputedStyle(document.querySelector("#htnote-content h1 span")!).color), "rgb(50, 102, 187)");
    });
  });

  it("persists a global tag color and renders the same color in chips and filter", async () => {
    const note = await createNote("Tags");
    await invoke("update_metadata", { id: note.id, patch: { tags: ["Work"] } });
    await browser.refresh();
    await openNote(note.id);
    await $('button[aria-label="Color for tag Work"]').click();
    await $('[role="dialog"] button[aria-label="Blue"]').click();
    await browser.waitUntil(async () => (await invoke<{ tagColors: Record<string, string> }>("get_settings")).tagColors.work === "blue");
    await browser.refresh();
    await openNote(note.id);
    const chipColor = await browser.execute(() => {
      const chip = [...document.querySelectorAll("span")].find((element) => element.textContent?.startsWith("Work") && element.querySelector(".htnote-tag-dot"));
      return chip ? getComputedStyle(chip).color : null;
    });
    assert.ok(chipColor);
    await $('section[aria-label="Tags"] button[aria-pressed]').click();
    assert.equal(await browser.execute(() => getComputedStyle(document.querySelector('button[aria-label="Remove Work tag filter"]')!).color), chipColor);
  });
});
