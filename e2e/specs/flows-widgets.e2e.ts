import assert from "node:assert/strict";
import { join } from "node:path";
import { createNote, editNote, openNote, saveAndView, useTempRoot, visibleEditorTool, waitForFile, withNoteFrame, invoke } from "../helpers/flows";

describe("text box widget", () => {
  let root: string;
  let restore: () => Promise<void>;
  before(async () => { ({ root, restore } = await useTempRoot()); });
  after(async () => { await restore(); });

  it("inserts and saves copy fields, copies rows/all and preserves the saved definition list", async () => {
    const note = await createNote("Copy fields round trip");
    await openNote(note.id); await editNote();
    await (await visibleEditorTool('[data-testid="insert-widget"]')).click();
    await $('[data-testid="insert-copyfields"]').click();
    const title = await $('[data-testid="copyfields-title"]'); await title.waitForDisplayed();
    await title.setValue("Server fields"); await browser.keys("Enter");
    await $('[data-testid="copyfields-label"]').setValue("Host"); await browser.keys("Enter");
    assert.equal(await browser.execute(() => document.activeElement?.getAttribute("data-testid")), "copyfields-value");
    await $('[data-testid="copyfields-value"]').setValue("server <&> value"); await browser.keys("Enter");
    await browser.waitUntil(async () => (await $$('[data-testid="copyfields-value"]')).length === 2);
    await (await $$('[data-testid="copyfields-value"]'))[1].setValue("unlabeled"); await browser.keys("Enter");
    await browser.waitUntil(async () => (await $$('[data-testid="copyfields-value"]')).length === 3);
    await (await $$('[data-testid="copyfields-label"]'))[2].setValue("Empty");
    await (await $$('[data-testid="copyfields-value"]'))[2].click(); await browser.keys("Enter");
    await browser.waitUntil(async () => (await $$('[data-testid="copyfields-value"]')).length === 4);
    await $('.htnote-widget-tools button').click();
    await $('.htnote-color-popover button[aria-label="Nane"], .htnote-color-popover button[aria-label="Mint"]').click();
    const html = await saveAndView(note.id, (value) => value.includes("Server fields") && value.includes("server &lt;&amp;&gt; value"));
    assert.match(html, /<dl class="htnote-copyfields-list"><div class="htnote-copyfields-row"><dt>Host<\/dt><dd>server &lt;&amp;&gt; value<\/dd>/);
    assert.ok(!html.includes("htnote-copyfields-node")); assert.ok(!html.includes("copyfields-copy-row"));
    assert.equal((html.match(/class="htnote-copyfields-row"/g) || []).length, 3);
    const exportedPath = join(root, "copyfields-export.html");
    await invoke("export_single_html", { id: note.id, targetPath: exportedPath });
    const exported = (await waitForFile(exportedPath)).toString();
    assert.ok(exported.includes('<dt>Host</dt><dd>server &lt;&amp;&gt; value</dd>'));
    assert.ok(!exported.includes("/__htnote/bridge.js"));
    await withNoteFrame(note.id, async () => {
      const copyAll = await $('[data-testid="copyfields-copy-all"]'); await copyAll.waitForExist();
      await browser.waitUntil(async () => (await copyAll.getText()).length > 0);
      await browser.execute(() => { const field = document.createElement("textarea"); field.id = "copyfields-probe"; document.body.append(field); });
      const probe = await $('#copyfields-probe');
      const verifyClipboard = async (expected: string) => {
        await probe.setValue(""); await probe.click(); await browser.keys(["Control", "v"]);
        await browser.waitUntil(async () => await probe.getValue() === expected);
      };
      const buttons = await $$('[data-testid="copyfields-copy-row"]');
      assert.equal(buttons.length, 2);
      await buttons[0].click();
      await browser.waitUntil(async () => /Kopyalandı|Copied/.test(await buttons[0].getText()));
      await verifyClipboard("server <&> value");
      await (await $$('.htnote-copyfields-row dd'))[1].doubleClick();
      await browser.waitUntil(async () => /Kopyalandı|Copied/.test(await buttons[1].getText()));
      await verifyClipboard("unlabeled");
      await copyAll.click(); await browser.waitUntil(async () => /Kopyalandı|Copied/.test(await copyAll.getText()));
      await verifyClipboard("Host: server <&> value\nunlabeled");
      await browser.waitUntil(async () => !/Kopyalandı|Copied/.test(await buttons[0].getText()));
      assert.equal(await (await $$('.htnote-copyfields-row dd'))[0].getText(), "server <&> value");
      await browser.execute(() => document.getElementById("copyfields-probe")?.remove());
    });
    assert.equal((await invoke<{ html: string }>("read_note", { id: note.id })).html, html);
    assert.equal((await waitForFile(join(root, note.relPath, "index.html"))).toString(), html);
    await editNote();
    assert.equal(await $('[data-testid="copyfields-title"]').getValue(), "Server fields");
    assert.equal((await $$('[data-testid="copyfields-value"]')).length, 3);
    assert.equal(await (await $$('[data-testid="copyfields-value"]'))[0].getValue(), "server <&> value");
    await $('[data-testid="cancel-edit"]').click();
  });

  it("saves checklist defaults, copies remaining items, resets and discards viewer checks on refresh", async () => {
    const note = await createNote("Checklist round trip");
    await openNote(note.id);
    await editNote();
    await (await visibleEditorTool('[data-testid="insert-widget"]')).click();
    await $('[data-testid="insert-checklist"]').click();
    const title = await $('[data-testid="checklist-title"]');
    await title.waitForDisplayed();
    await title.setValue("Release checklist");
    await browser.keys("Enter");
    assert.equal(await browser.execute(() => document.activeElement?.getAttribute("data-testid")), "checklist-item");
    await $('[data-testid="checklist-item"]').setValue("First <&> item");
    await $('.htnote-checklist-editor-row input[type="checkbox"]').click();
    await $('[data-testid="checklist-item"]').click();
    await browser.keys("End");
    await browser.keys("Enter");
    await browser.waitUntil(async () => (await $$('[data-testid="checklist-item"]')).length === 2);
    await (await $$('[data-testid="checklist-item"]'))[1].setValue("Second remaining");
    await browser.keys("Enter");
    await browser.waitUntil(async () => (await $$('[data-testid="checklist-item"]')).length === 3);
    await (await $$('[data-testid="checklist-item"]'))[2].setValue("Third remaining");
    await browser.keys("Enter");
    await browser.waitUntil(async () => (await $$('[data-testid="checklist-item"]')).length === 4);
    await $('.htnote-widget-tools button').click();
    await $('.htnote-color-popover button[aria-label="Nane"], .htnote-color-popover button[aria-label="Mint"]').click();
    const html = await saveAndView(note.id, (value) => value.includes("Release checklist") && value.includes("First &lt;&amp;&gt; item"));
    assert.match(html, /<div class="htnote-checklist" data-htnote-widget="checklist" data-htnote-bg="mint">/);
    assert.match(html, /<input type="checkbox" checked> First &lt;&amp;&gt; item/);
    assert.ok(!html.includes("htnote-checklist-node"));
    assert.ok(!html.includes("checklist-reset"));
    const exportedPath = join(root, "checklist-export.html");
    await invoke("export_single_html", { id: note.id, targetPath: exportedPath });
    const exported = (await waitForFile(exportedPath)).toString();
    assert.ok(exported.includes('<input type="checkbox" checked>'));
    assert.ok(exported.includes("Third remaining"));
    assert.ok(!exported.includes("/__htnote/bridge.js"));
    await withNoteFrame(note.id, async () => {
      const reset = await $('[data-testid="checklist-reset"]');
      await reset.waitForExist();
      const inputs = await $('.htnote-checklist-items').$$('input');
      assert.equal(await inputs[0].isSelected(), true);
      assert.equal(await reset.isEnabled(), false);
      assert.equal(await $('[data-testid="checklist-counter"]').getText(), "1 / 3");
      await inputs[1].click();
      assert.equal(await $('[role="progressbar"]').getAttribute("aria-valuenow"), "2");
      assert.equal(await reset.isEnabled(), true);
      const copy = await $('[data-testid="checklist-copy"]');
      await browser.waitUntil(async () => (await copy.getText()).length > 0);
      await copy.click();
      await browser.waitUntil(async () => /Kopyalandı|Copied/.test(await copy.getText()));
      // Gerçek sistem panosunu yerel bir alana yapıştırarak kalan metni doğrula.
      await browser.execute(() => {
        const field = document.createElement("textarea"); field.id = "checklist-clipboard-probe"; document.body.append(field);
      });
      const probe = await $('#checklist-clipboard-probe');
      await probe.click(); await browser.keys(["Control", "v"]);
      await browser.waitUntil(async () => await probe.getValue() === "Third remaining");
      await browser.execute(() => document.getElementById("checklist-clipboard-probe")?.remove());
      await reset.click();
      assert.equal(await inputs[0].isSelected(), true);
      assert.equal(await inputs[1].isSelected(), false);
      assert.equal(await reset.isEnabled(), false);
      await inputs[0].click();
      await inputs[2].click();
    });
    assert.equal((await invoke<{ html: string }>("read_note", { id: note.id })).html, html);
    assert.equal((await waitForFile(join(root, note.relPath, "index.html"))).toString(), html);
    await browser.refresh(); await openNote(note.id);
    await withNoteFrame(note.id, async () => {
      const inputs = await $('.htnote-checklist-items').$$('input');
      assert.equal(await inputs[0].isSelected(), true);
      assert.equal(await inputs[1].isSelected(), false);
      assert.equal(await inputs[2].isSelected(), false);
      assert.equal(await $('[data-testid="checklist-counter"]').getText(), "1 / 3");
    });
    await editNote();
    assert.equal(await $('[data-testid="checklist-title"]').getValue(), "Release checklist");
    const fields = await $$('[data-testid="checklist-item"]');
    assert.equal(fields.length, 3);
    assert.equal(await fields[0].getValue(), "First <&> item");
    assert.equal(await fields[2].getValue(), "Third remaining");
    await $('[data-testid="cancel-edit"]').click();
  });

  it("saves the editable atom, copies actual live text in WebView2, resets and discards viewer changes", async () => {
    const note = await createNote("Textbox round trip");
    await openNote(note.id);
    await editNote();
    await (await visibleEditorTool('[data-testid="insert-widget"]')).click();
    await $('[data-testid="insert-textbox"]').click();
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
    await $('.htnote-widget-tools button').click();
    const mint = await $('.htnote-color-popover button[aria-label="Nane"], .htnote-color-popover button[aria-label="Mint"]');
    await mint.waitForDisplayed();
    await mint.click();
    const html = await saveAndView(note.id, (value) => value.includes("Widget title") && value.includes("&lt;saved&gt; &amp; last line"));
    assert.match(html, /<div class="htnote-textbox" data-htnote-widget="textbox" data-htnote-bg="mint">/);
    const savedDocument = await browser.execute((source) => {
      const doc = new DOMParser().parseFromString(source, "text/html");
      return { bodyBackground: doc.body.getAttribute("data-ht-bg"), appearance: doc.getElementById("htnote-appearance")?.textContent };
    }, html);
    assert.equal(savedDocument.bodyBackground, null);
    assert.ok(savedDocument.appearance?.includes("--ht-note-mint:"));
    const exportedPath = join(root, "widget-export.html");
    await invoke("export_single_html", { id: note.id, targetPath: exportedPath });
    const exported = (await waitForFile(exportedPath)).toString();
    assert.ok(exported.includes('data-htnote-bg="mint"'));
    assert.ok(exported.includes("--ht-note-mint:"));
    assert.ok(!exported.includes("/__htnote/bridge.js"));
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
    await $('.htnote-widget-tools button').click();
    assert.equal(await $('.htnote-color-popover button[aria-label="Nane"], .htnote-color-popover button[aria-label="Mint"]').getAttribute("aria-pressed"), "true");
    await browser.keys("Escape");
    await $('[data-testid="cancel-edit"]').click();
  });
});
