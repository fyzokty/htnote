import assert from "node:assert/strict";

import { createNote, invoke, openNote, useTempRoot, withNoteFrame } from "../helpers/flows";

describe("tab reordering", () => {
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

    const from = await $(`[data-note-id="${b.id}"] [role="tab"]`);
    const to = await $(`[data-note-id="${a.id}"] [role="tab"]`);
    const start = await from.getLocation();
    const end = await to.getLocation();
    await browser.performActions([{
      type: "pointer", id: "tab-drag", parameters: { pointerType: "mouse" }, actions: [
        { type: "pointerMove", duration: 0, x: Math.round(start.x + 60), y: Math.round(start.y + 15) },
        { type: "pointerDown", button: 0 },
        { type: "pointerMove", duration: 200, x: Math.round(start.x + 45), y: Math.round(start.y + 15) },
        { type: "pause", duration: 100 },
        { type: "pointerMove", duration: 400, x: Math.round(end.x + 60), y: Math.round(end.y + 15) },
        { type: "pause", duration: 100 },
        { type: "pointerUp", button: 0 },
      ],
    }]);
    await browser.releaseActions();
    await browser.waitUntil(async () => await $('[role="tablist"] > div').getAttribute("data-note-id") === b.id);

    for (const id of [a.id, b.id]) {
      await openNote(id);
      await withNoteFrame(id, async () => {
        assert.equal(await $("html").getAttribute("data-ht-theme"), "dark");
        assert.equal(await $("html").getAttribute("data-reorder-test"), "preserved");
      });
    }
  });
});
