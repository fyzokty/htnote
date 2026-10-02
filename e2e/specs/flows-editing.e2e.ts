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
    await $('[data-testid="save-note"]').click();
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

  it("discards a dirty tab on close", async () => {
    const note = await createNote("Dirty");
    await openNote(note.id);
    await editNote();
    await typeInVisualEditor("Unsaved change");
    await browser.waitUntil(async () => await $(`[data-note-id="${note.id}"]`).getText().then((text) => text.includes("•")));
    await $(`[data-note-id="${note.id}"] button`).click();
    await $('[role="dialog"] [data-testid="discard-changes"]').waitForDisplayed();
    await $('[data-testid="discard-changes"]').click();
    await browser.waitUntil(async () => !await $(`[data-note-id="${note.id}"]`).isExisting());
  });
});
