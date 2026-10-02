import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createNote, invoke, openNote, useTempRoot, waitForFile } from "../helpers/flows";

describe("export flow", () => {
  let restore: (() => Promise<void>) | undefined;
  beforeEach(async () => { ({ restore } = await useTempRoot()); });
  afterEach(async () => { await restore?.(); });

  it("exports HTML, ZIP and PDF to explicit paths", async () => {
    const target = await mkdtemp(join(tmpdir(), "htnote-export-"));
    try {
      const note = await createNote("Exported note");
      await browser.refresh();
      await openNote(note.id);
      const html = join(target, "note.html");
      const zip = join(target, "note.zip");
      const pdf = join(target, "note.pdf");
      await invoke("export_single_html", { id: note.id, targetPath: html });
      assert.match((await waitForFile(html)).toString(), /Exported note/);
      await invoke("export_zip", { id: note.id, targetPath: zip });
      const archive = await waitForFile(zip, (bytes) => bytes.includes(Buffer.from("index.html")));
      assert.equal(archive.subarray(0, 2).toString(), "PK");
      assert.ok(archive.includes(Buffer.from("metadata.json")));
      await invoke("export_pdf", { id: note.id, targetPath: pdf });
      const document = await waitForFile(pdf, (bytes) => bytes.length > 4 && bytes.subarray(0, 4).toString() === "%PDF");
      assert.equal(document.subarray(0, 4).toString(), "%PDF");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});
