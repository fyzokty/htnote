import assert from "node:assert/strict";

describe("app smoke", () => {
  it("starts, lists fixture notes and loads one in an iframe", async () => {
    const evil = await $('[data-tree-key="note:3f6c2a9e-8b1d-4c57-9e0a-2d4b7f1c5e88"]');
    const safe = await $('[data-tree-key="note:1a8f451e-5c7a-42b9-a38b-25f9d771ea40"]');
    await evil.waitForDisplayed();
    await safe.waitForDisplayed();
    await safe.click();
    const frame = await $('iframe[title="Safe Note"]');
    await frame.waitForExist();
    await browser.switchFrame(frame);
    const content = await $("#htnote-content");
    await content.waitForDisplayed();
    assert.equal(await content.getText(), "Safe fixture loaded");
    await browser.switchFrame(null);
  });
});
