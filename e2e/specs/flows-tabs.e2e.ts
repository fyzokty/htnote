import assert from "node:assert/strict";

import { createNote, invoke, openNote, useTempRoot, withNoteFrame } from "../helpers/flows";

async function dragTab(from: WebdriverIO.Element, to: WebdriverIO.Element): Promise<void> {
  const start = await from.getLocation();
  const end = await to.getLocation();
  // A separate move activates the distance sensor before moving to the target.
  // WebView2 need not emit intermediate events for a duration-based move.
  try {
    await browser.performActions([{
      type: "pointer", id: "tab-drag", parameters: { pointerType: "mouse" }, actions: [
        { type: "pointerMove", duration: 0, x: Math.round(start.x + 60), y: Math.round(start.y + 15) },
        { type: "pointerDown", button: 0 },
        { type: "pointerMove", duration: 100, x: Math.round(start.x + 50), y: Math.round(start.y + 15) },
        { type: "pause", duration: 100 },
      ],
    }]);
    await browser.waitUntil(async () => await from.getAttribute("data-dragging") === "true");
    assert.ok(Number((await from.getCSSProperty("z-index")).value) > Number((await to.getCSSProperty("z-index")).value));
    await browser.performActions([{
      type: "pointer", id: "tab-drag", parameters: { pointerType: "mouse" }, actions: [
        { type: "pointerMove", duration: 400, x: Math.round(end.x + 60), y: Math.round(end.y + 15) },
        { type: "pause", duration: 100 },
        { type: "pointerUp", button: 0 },
      ],
    }]);
  } finally {
    await browser.releaseActions();
  }
}

describe("tab reordering", () => {
  let restore: (() => Promise<void>) | undefined;
  let theme: string;
  let tabSizing: string;
  beforeEach(async () => {
    ({ theme, tabSizing } = await invoke<{ theme: string; tabSizing: string }>("get_settings"));
    ({ restore } = await useTempRoot());
  });
  afterEach(async () => {
    await invoke("update_settings", { patch: { theme, tabSizing } });
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
      await withNoteFrame(id, async () => {
        await browser.waitUntil(async () => await $("html").getAttribute("data-ht-theme") === "dark");
        await browser.execute(() => { document.documentElement.dataset.reorderTest = "preserved"; });
      });
    }

    const from = await $(`[role="tab"][data-note-id="${b.id}"]`);
    const to = await $(`[role="tab"][data-note-id="${a.id}"]`);
    const start = await from.getLocation();
    const end = await to.getLocation();
    await browser.performActions([{
      type: "pointer", id: "tab-drag", parameters: { pointerType: "mouse" }, actions: [
        { type: "pointerMove", duration: 0, x: Math.round(start.x + 60), y: Math.round(start.y + 15) },
        { type: "pointerDown", button: 0 },
        // Activate inside the parent document before crossing into the note iframe.
        { type: "pointerMove", duration: 100, x: Math.round(start.x + 50), y: Math.round(start.y + 15) },
        { type: "pause", duration: 100 },
        { type: "pointerMove", duration: 200, x: Math.round(start.x + 60), y: Math.round(start.y + 150) },
        { type: "pause", duration: 100 },
      ],
    }]);
    assert.equal(await from.getAttribute("data-dragging"), "true");
    assert.ok(Math.abs((await from.getLocation()).y - start.y) < 2);
    assert.ok(Number((await from.getCSSProperty("z-index")).value) > Number((await to.getCSSProperty("z-index")).value));
    await browser.performActions([{
      type: "pointer", id: "tab-drag", parameters: { pointerType: "mouse" }, actions: [
        { type: "pointerMove", duration: 400, x: Math.round(end.x + 60), y: Math.round(end.y + 15) },
        { type: "pause", duration: 100 },
        { type: "pointerUp", button: 0 },
      ],
    }]);
    await browser.releaseActions();
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

  it("changes tab sizing in settings and restores only note tabs", async () => {
    const note = await createNote("A long title for checking the size of a note tab");
    await openNote(note.id);
    await $('[data-testid="settings"]').click();
    const fit = await $('button*=Başlığa göre');
    await fit.click();
    await browser.waitUntil(async () => (await invoke<{ tabSizing: string }>("get_settings")).tabSizing === "fit");
    assert.equal(await $(`[role="tab"][data-note-id="${note.id}"]`).getAttribute("data-sizing"), "fit");
    await $('button*=Sabit genişlik').click();
    await browser.waitUntil(async () => (await invoke<{ tabSizing: string }>("get_settings")).tabSizing === "fixed");
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
    await trash.click({ button: "middle" });
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
