import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { pointerCenter, pointerClickAt } from "../helpers/pointer";

import { createNote, flatten, invoke, openNote, tree, useTempRoot, waitForTreeItem, withNoteFrame } from "../helpers/flows";

describe("organize and search flows", () => {
  let restore: (() => Promise<void>) | undefined;
  let root: string;
  beforeEach(async () => { ({ root, restore } = await useTempRoot()); });
  afterEach(async () => { await restore?.(); });

  it("deletes a note and restores it from trash", async () => {
    const note = await createNote("Restore me");
    await browser.refresh();
    await (await waitForTreeItem(note.id)).click();
    const item = await waitForTreeItem(note.id);
    const center = await pointerCenter(item);
    await pointerClickAt(item, center.x, center.y, { button: 2 });
    await $('[role="menu"] > div:last-child [role="menuitem"]').click();
    await browser.waitUntil(async () => !flatten(await tree()).some((item) => item.id === note.id));
    await $('[data-testid="trash"]').click();
    assert.equal(await $('[role="tab"][data-note-id="special:trash"]').getAttribute("aria-selected"), "true");
    const row = await $("li*=Restore me");
    await row.waitForDisplayed();
    await row.$("button").click();
    await browser.waitUntil(async () => flatten(await tree()).some((item) => item.id === note.id));
    await (await waitForTreeItem(note.id)).waitForDisplayed();
    await openNote(note.id);
    assert.equal(await $('[role="tab"][data-note-id="special:trash"]').isExisting(), true);
  });

  it("finds İstanbul with both casings and highlights the result", async () => {
    const note = await createNote("City");
    const base = await invoke<{ html: string; css: string | null; js: string | null; contentHash: string }>("read_note", { id: note.id });
    await invoke("save_note", { id: note.id, payload: {
      html: base.html.replace("</main>", "İstanbul is here</main>"), css: base.css ?? "", js: base.js ?? "", expectedHash: base.contentHash,
    } });
    await browser.refresh();
    for (const query of ["İstanbul", "istanbul"]) {
      await $('[data-testid="global-search"]').click();
      await $('[data-testid="search-input"]').setValue(query);
      const result = await $('[data-testid="search-result"]');
      await result.waitForDisplayed({ timeout: 15000 });
      assert.match(await result.getText(), /City/);
      await result.click();
      await withNoteFrame(note.id, async () => {
        await browser.waitUntil(async () => await $("mark.htnote-highlight").isExisting(), { timeout: 15000 });
        assert.match(await $("mark.htnote-highlight").getText(), /stanbul/);
      });
    }
  });

  it("updates the viewer after an external file change", async () => {
    const note = await createNote("External");
    await browser.refresh();
    await openNote(note.id);
    const path = join(root, note.relPath, "index.html");
    const original = await readFile(path, "utf8");
    await writeFile(path, original.replace("</main>", "External update</main>"));
    // Dosya izleyicisinin debounce süresi için içerik koşulu beklenir.
    await browser.waitUntil(async () => {
      return withNoteFrame(note.id, async () => (await $("#htnote-content").getText()).includes("External update"));
    }, { timeout: 30000, interval: 200 });
  });
});
