import assert from "node:assert/strict";

import { waitForApp } from "../helpers/app";
import { invoke } from "../helpers/flows";

describe("note isolation", () => {
  it("blocks all seven escape attempts", async () => {
    await waitForApp();
    const hostUrl = await browser.getUrl();
    assert.equal(new URL(hostUrl).hostname, "tauri.localhost");
    const note = await $('[data-tree-key="note:3f6c2a9e-8b1d-4c57-9e0a-2d4b7f1c5e88"]');
    await note.waitForDisplayed();
    await note.click();
    const frame = await $('iframe[title="Evil Note"]');
    await frame.waitForExist();
    await browser.switchFrame(frame);
    const root = await $("html");
    await browser.waitUntil(async () => await root.getAttribute("data-done") === "true", { timeout: 30000 });
    for (const check of ["parent-document", "internals", "invoke", "top-navigation", "popup", "traversal", "ipc-fetch"]) {
      assert.equal(await root.getAttribute(`data-${check}`), "pass", check);
    }
    assert.equal(await browser.execute(() => document.title), "Isolation complete");
    await browser.switchFrame(null);
    assert.equal(await browser.getUrl(), hostUrl);
    assert.equal((await browser.getWindowHandles()).length, 1);
  });

  it("denies invoke from a draft preview frame", async () => {
    const id = "3f6c2a9e-8b1d-4c57-9e0a-2d4b7f1c5e88";
    const note = await $('[data-tree-key="note:3f6c2a9e-8b1d-4c57-9e0a-2d4b7f1c5e88"]');
    await note.waitForDisplayed();
    await note.click();
    const frame = await $('iframe[title="Evil Note"]');
    await frame.waitForExist();
    const origin = await invoke<string>("get_note_origin");
    const rev = await invoke<number>("set_preview_draft", {
      id,
      html: '<html><head></head><body><script>(async () => { const invoke = window.__TAURI_INTERNALS__?.invoke; try { if (invoke) await invoke("set_preview_draft", { id: "3f6c2a9e-8b1d-4c57-9e0a-2d4b7f1c5e88", html: "attack", css: "", js: "" }); document.documentElement.dataset.invoke = invoke ? "fail" : "pass"; } catch { document.documentElement.dataset.invoke = "pass"; } document.documentElement.dataset.done = "true"; })();</script></body></html>',
      css: "", js: "",
    });
    try {
      await browser.execute((url) => {
        document.querySelector<HTMLIFrameElement>('iframe[title="Evil Note"]')!.src = url;
      }, `${origin}/${id}/__draft/${rev}/index.html`);
      await browser.switchFrame(frame);
      const root = await $("html");
      await browser.waitUntil(async () => await root.getAttribute("data-done") === "true");
      assert.equal(await root.getAttribute("data-invoke"), "pass");
    } finally {
      await browser.switchFrame(null);
      await invoke("clear_preview_draft", { id });
    }
  });
});
