import assert from "node:assert/strict";

import { createNote, editNote, flatten, invoke, openNote, tree, useTempRoot, withNoteFrame } from "../helpers/flows";
import type { NoteNode } from "../helpers/flows";

describe("internal link flows", () => {
  let restore: (() => Promise<void>) | undefined;
  beforeEach(async () => { ({ restore } = await useTempRoot()); });
  afterEach(async () => { await restore?.(); });

  async function linkedNotes(): Promise<{ a: NoteNode; b: NoteNode }> {
    const a = await createNote("Source A");
    const b = await createNote("Target B");
    await browser.refresh();
    await openNote(a.id);
    await editNote();
    await $('[data-testid="link-note"]').click();
    const picker = await $('[role="dialog"] [role="listbox"]');
    await picker.waitForDisplayed();
    await picker.$('[role="option"]').click();
    await $('[data-testid="save-note"]').click();
    await withNoteFrame(a.id, async () => {
      await $(`a[href="htnote://note/${b.id}"]`).waitForDisplayed();
    }, { expectedHref: `htnote://note/${b.id}` });
    return { a, b };
  }

  async function followLink(a: NoteNode, b: NoteNode) {
    await openNote(a.id);
    await withNoteFrame(a.id, async () => {
      await $(`a[href="htnote://note/${b.id}"]`).click();
    }, { expectedHref: `htnote://note/${b.id}` });
    await browser.waitUntil(async () => await $(`[role="tab"][data-note-id="${b.id}"]`).getAttribute("aria-selected") === "true");
    const backlinks = await $("section:has(> button[aria-expanded])");
    await backlinks.waitForDisplayed();
    await browser.waitUntil(async () => (await backlinks.getText()).includes(a.title));
    assert.match(await backlinks.getText(), /Source A/);
  }

  it("opens B from A and shows A in backlinks", async () => {
    const { a, b } = await linkedNotes();
    await followLink(a, b);
  });

  it("keeps the link valid after renaming and moving B", async () => {
    const { a, b } = await linkedNotes();
    await invoke("rename_note", { id: b.id, newTitle: "Renamed B" });
    const folder = await invoke<{ relPath: string }>("create_folder", { parentRelPath: "", name: "Moved" });
    const target = flatten(await tree()).find((node) => node.id === b.id);
    assert.ok(target);
    await invoke("move_item", { relPath: target.relPath, targetFolderRelPath: folder.relPath });
    await browser.refresh();
    assert.ok(flatten(await tree()).find((item) => item.id === b.id)?.relPath.startsWith(`${folder.relPath}/`));
    await followLink(a, b);
    assert.equal((await invoke<{ metadata: { title: string } }>("read_note", { id: b.id })).metadata.title, "Renamed B");
  });
});
