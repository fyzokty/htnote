import assert from "node:assert/strict";
import { join } from "node:path";
import { createNote, editNote, openNote, saveAndView, useTempRoot, visibleEditorTool, waitForFile, withNoteFrame, invoke } from "../helpers/flows";

describe("text box widget", () => {
  let root: string;
  let restore: () => Promise<void>;
  before(async () => { ({ root, restore } = await useTempRoot()); });
  after(async () => { await restore(); });

  it("saves the editable atom, copies actual live text in WebView2, resets and discards viewer changes", async () => {
    const note = await createNote("Textbox round trip");
    await openNote(note.id);
    await editNote();
    await (await visibleEditorTool('[data-testid="insert-textbox"]')).click();
    const title = await $('[data-testid="textbox-title"]');
    const content = await $('[data-testid="textbox-content"]');
    await title.waitForDisplayed();
    assert.equal(await title.getValue(), "");
    assert.equal(await content.getValue(), "");
    await title.setValue("Widget title");
    await browser.keys("Enter");
    assert.equal(await browser.execute(() => document.activeElement?.getAttribute("data-testid")), "textbox-content");
    const saved = "Saved first line\n<saved> & last line";
    await content.setValue(saved);
    const html = await saveAndView(note.id, (value) => value.includes("Widget title") && value.includes("&lt;saved&gt; &amp; last line"));
    assert.match(html, /<div class="htnote-textbox" data-htnote-widget="textbox">/);
    assert.match(html, /<textarea class="htnote-textbox-input" spellcheck="false" rows="3">Saved first line\n&lt;saved&gt; &amp; last line<\/textarea>/);
    assert.ok(!html.includes("htnote-textbox-actions"));
    assert.ok(!html.includes("htnote-textbox-node"));
    await waitForFile(join(root, note.relPath, "index.html"), (bytes) => bytes.toString().includes("Widget title"));
    const live = "Live clipboard text\n<temporary> & content";
    await withNoteFrame(note.id, async () => {
      const field = await $(".htnote-textbox-input");
      assert.equal(await field.getValue(), saved);
      assert.equal(await $(".htnote-textbox-title").getText(), "Widget title");
      const reset = await $('[data-testid="textbox-reset"]');
      await reset.waitForExist();
      assert.equal(await reset.isEnabled(), false);
      await field.setValue(live);
      assert.equal(await reset.isEnabled(), true);
      // Yalnız ölçüm: gerçek tarayıcı API'lerinin sonuçlarını kaydet, davranışı değiştirme.
      await browser.execute(() => {
        const audit: string[] = [];
        (window as unknown as { textboxCopyAudit: string[] }).textboxCopyAudit = audit;
        if (navigator.clipboard) {
          const write = navigator.clipboard.writeText.bind(navigator.clipboard);
          navigator.clipboard.writeText = async (value) => {
            try { await write(value); audit.push("clipboard.writeText:success"); }
            catch (error) { audit.push("clipboard.writeText:blocked"); throw error; }
          };
        }
        const exec = document.execCommand.bind(document);
        document.execCommand = (command, ...args) => {
          const result = exec(command, ...args);
          if (command === "copy") audit.push(`execCommand: ${result}`);
          return result;
        };
      });
      const copy = await $('[data-testid="textbox-copy"]');
      await browser.waitUntil(async () => (await copy.getText()).length > 0);
      await copy.click();
      await browser.waitUntil(async () => /Kopyalandı|Copied/.test(await copy.getText()));
      const audit = await browser.execute(() => (window as unknown as { textboxCopyAudit: string[] }).textboxCopyAudit);
      console.info("WebView2 textbox clipboard path:", audit.join(", "));
      assert.ok(audit.some((entry) => entry === "clipboard.writeText:success" || entry === "execCommand: true"));
      await reset.click();
      assert.equal(await field.getValue(), saved);
      assert.equal(await reset.isEnabled(), false);
      await field.setValue("");
      await field.click();
      await browser.keys(["Control", "v"]);
      await browser.waitUntil(async () => await field.getValue() === live, { timeoutMsg: "Actual clipboard paste did not match the live textarea content" });
      await reset.click();
      assert.equal(await field.getValue(), saved);
      await field.setValue("Unsaved viewer mutation");
    });
    assert.equal((await invoke<{ html: string }>("read_note", { id: note.id })).html, html);
    await browser.refresh();
    await openNote(note.id);
    await withNoteFrame(note.id, async () => {
      assert.equal(await $(".htnote-textbox-input").getValue(), saved);
    });
    await editNote();
    assert.equal(await $('[data-testid="textbox-title"]').getValue(), "Widget title");
    assert.equal(await $('[data-testid="textbox-content"]').getValue(), saved);
    await $('[data-testid="cancel-edit"]').click();
  });
});
