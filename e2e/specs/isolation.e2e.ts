import assert from "node:assert/strict";

describe("note isolation", () => {
  it("blocks all seven escape attempts", async () => {
    const hostUrl = await browser.getUrl();
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
});
