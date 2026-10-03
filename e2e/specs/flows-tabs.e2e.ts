import assert from "node:assert/strict";

import { clampPointerPoint, pointerCenter, pointerClickAt, pointerDrag, type PointerElement } from "../helpers/pointer";

import { createNote, invoke, openNote, useTempRoot, withNoteFrame } from "../helpers/flows";

async function dragTab(source: PointerElement, target: PointerElement): Promise<void> {
  const from = await source.getElement();
  const to = await target.getElement();
  await pointerDrag(from, to, {
    afterActivation: async () => {
      await browser.waitUntil(async () => await from.getAttribute("data-dragging") === "true");
      assert.ok(Number((await from.getCSSProperty("z-index")).value) > Number((await to.getCSSProperty("z-index")).value));
    },
  });
}

describe("tab reordering", () => {
  let restore: (() => Promise<void>) | undefined;
  let theme: string;
  let tabSizing: string;
  let language: string | null;
  beforeEach(async () => {
    ({ theme, tabSizing, language } = await invoke<{ theme: string; tabSizing: string; language: string | null }>("get_settings"));
    ({ restore } = await useTempRoot());
  });
  afterEach(async () => {
    await invoke("update_settings", { patch: { theme, tabSizing, language } });
    await restore?.();
  });

  it("keeps both note documents and their dark theme after dragging a tab", async () => {
    const a = await createNote("Tab Alpha");
    const b = await createNote("Tab Beta");
    await invoke("update_settings", { patch: { theme: "dark" } });
    await browser.refresh();
    await openNote(a.id);
    await openNote(b.id);
    for (const id of [a.id, b.id]) {
      await openNote(id);
      await withNoteFrame(id, async () => {
        await browser.waitUntil(async () => await $("html").getAttribute("data-ht-theme") === "dark");
        await browser.execute(() => { document.documentElement.dataset.reorderTest = "preserved"; });
      });
    }

    const from = await $(`[role="tab"][data-note-id="${b.id}"]`);
    const to = await $(`[role="tab"][data-note-id="${a.id}"]`);
    const start = await from.getLocation();
    const end = await to.getLocation();
    const fromPoint = await clampPointerPoint({ x: start.x + 60, y: start.y + 15 });
    const toPoint = await clampPointerPoint({ x: end.x + 60, y: end.y + 15 });
    const below = await clampPointerPoint({ x: fromPoint.x, y: start.y + 150 });
    assert.ok(below.y - fromPoint.y > 10, "Vertical excursion must exceed the drag activation distance");
    await pointerDrag(from, to, {
      fromPoint,
      toPoint,
      waypoints: [below],
      beforeDrop: async () => {
        assert.equal(await from.getAttribute("data-dragging"), "true");
        assert.ok(Math.abs((await from.getLocation()).y - start.y) < 2);
        assert.ok(Number((await from.getCSSProperty("z-index")).value) > Number((await to.getCSSProperty("z-index")).value));
      },
    });
    await browser.waitUntil(async () => await $('[role="tablist"] > div').getAttribute("data-note-id") === b.id);

    // Reverse direction must keep the dragged tab above its siblings too.
    await dragTab(from, to);
    await browser.waitUntil(async () => await $('[role="tablist"] > div').getAttribute("data-note-id") === a.id);

    for (const id of [a.id, b.id]) {
      await openNote(id);
      await withNoteFrame(id, async () => {
        assert.equal(await $("html").getAttribute("data-ht-theme"), "dark");
        assert.equal(await $("html").getAttribute("data-reorder-test"), "preserved");
      });
    }
  });

  it("toggles singleton settings and trash tabs and uses shared tab shortcuts", async () => {
    const note = await createNote("Special tabs");
    await openNote(note.id);
    const settingsButton = await $('[data-testid="settings"]');
    const trashButton = await $('[data-testid="trash"]');
    await settingsButton.click();
    await $('[role="tab"][data-note-id="special:settings"]').waitForDisplayed();
    assert.equal(await settingsButton.getAttribute("aria-pressed"), "true");
    await trashButton.click();
    await $('[role="tab"][data-note-id="special:trash"]').waitForDisplayed();
    await settingsButton.click();
    assert.equal((await $$('[role="tab"][data-note-id="special:settings"]')).length, 1);
    await browser.keys(["Control", "Tab"]);
    await browser.waitUntil(async () => await trashButton.getAttribute("aria-pressed") === "true");
    await browser.keys(["Control", "w"]);
    await browser.waitUntil(async () => !await $('[role="tab"][data-note-id="special:trash"]').isExisting());
    await settingsButton.click();
    await browser.waitUntil(async () => !await $('[role="tab"][data-note-id="special:settings"]').isExisting());
    assert.equal(await $(`[role="tab"][data-note-id="${note.id}"]`).getAttribute("aria-selected"), "true");
  });

  for (const language of ["tr", "en"]) it(`changes tab sizing in ${language} settings and restores only note tabs`, async () => {
    await invoke("update_settings", { patch: { language } });
    const note = await createNote("A long title for checking the size of a note tab");
    await openNote(note.id);
    await $('[data-testid="settings"]').click();
    const fit = await $('[data-testid="tab-sizing-fit"]');
    await fit.waitForDisplayed();
    await fit.click();
    await browser.waitUntil(async () => (await invoke<{ tabSizing: string }>("get_settings")).tabSizing === "fit");
    assert.equal(await $(`[role="tab"][data-note-id="${note.id}"]`).getAttribute("data-sizing"), "fit");
    assert.equal(await fit.getAttribute("aria-pressed"), "true");
    await $('[data-testid="tab-sizing-fixed"]').click();
    await browser.waitUntil(async () => (await invoke<{ tabSizing: string }>("get_settings")).tabSizing === "fixed");
    assert.equal(await $(`[role="tab"][data-note-id="${note.id}"]`).getAttribute("data-sizing"), "fixed");
    assert.equal(await $('[data-testid="tab-sizing-fixed"]').getAttribute("aria-pressed"), "true");
    await $('[data-testid="trash"]').click();
    await browser.waitUntil(async () => {
      const saved = await invoke<{ openTabs: string[]; activeTab: string | null }>("get_settings");
      return saved.openTabs.includes(note.id) && saved.openTabs.every((id) => !id.startsWith("special:")) && saved.activeTab === note.id;
    });
    await browser.refresh();
    await browser.waitUntil(async () => await $(`[role="tab"][data-note-id="${note.id}"]`).isExisting());
    assert.equal((await $$('[role="tab"][data-note-id^="special:"]')).length, 0);
  });

  it("reorders special tabs and closes them with the close button and middle click", async () => {
    const note = await createNote("Special tab ordering");
    await openNote(note.id);
    await $('[data-testid="settings"]').click();
    await $('[data-testid="trash"]').click();
    const trash = await $('[role="tab"][data-note-id="special:trash"]');
    await dragTab(trash, await $(`[role="tab"][data-note-id="${note.id}"]`));
    await browser.waitUntil(async () => await $('[role="tablist"] > div').getAttribute("data-note-id") === "special:trash");
    await $('[role="tab"][data-note-id="special:settings"] button').click();
    await browser.waitUntil(async () => !await $('[role="tab"][data-note-id="special:settings"]').isExisting());
    const trashCenter = await pointerCenter(trash);
    await pointerClickAt(trash, trashCenter.x, trashCenter.y, { button: 1 });
    await browser.waitUntil(async () => !await $('[role="tab"][data-note-id="special:trash"]').isExisting());
    assert.equal(await $(`[role="tab"][data-note-id="${note.id}"]`).getAttribute("aria-selected"), "true");
  });

  it("scrolls an overflowing strip with the wheel and reveals the selected tab", async () => {
    const notes: { id: string }[] = [];
    for (let index = 0; index < 10; index++) {
      notes.push(await invoke<{ id: string }>("create_note", { parentRelPath: "", title: `Overflow ${index}` }));
    }
    await invoke("update_settings", { patch: { tabSizing: "fixed" } });
    await browser.refresh();
    for (const note of notes) await openNote(note.id);
    const before = await browser.execute(() => {
      const strip = document.querySelector<HTMLElement>('[role="tablist"]')!;
      const active = strip.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
      const bounds = strip.getBoundingClientRect();
      return { scroll: strip.scrollLeft, overflowing: strip.scrollWidth > strip.clientWidth, visible: active.left >= bounds.left - 1 && active.right <= bounds.right + 1 };
    });
    assert.equal(before.overflowing, true);
    assert.equal(before.visible, true);
    assert.ok(before.scroll > 0);
    const after = await browser.execute(() => {
      const strip = document.querySelector<HTMLElement>('[role="tablist"]')!;
      strip.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true }));
      return strip.scrollLeft;
    });
    assert.ok(after < before.scroll);
    await openNote(notes[0].id);
    assert.equal(await browser.execute(() => document.querySelector<HTMLElement>('[role="tablist"]')!.scrollLeft), 0);
  });
});
