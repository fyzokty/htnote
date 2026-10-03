import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const showcaseNote = "a8f4510e-5c7a-42b9-a38b-25f9d771ea40";
const output = resolve("docs", "images");

async function capture(name: string) {
  await browser.saveScreenshot(resolve(output, `${name}.png`));
}

describe("documentation screenshots", () => {
  it("captures the main screens from the fixture root", async () => {
    await mkdir(output, { recursive: true });
    const note = await $(`[data-tree-key="note:${showcaseNote}"]`);
    await note.waitForDisplayed();
    await note.click();
    await $('iframe[title="Haftalık odak planı"]').waitForExist();
    await capture("main-view");

    await $('[data-testid="edit-note"]').click();
    await $('[data-testid="visual-mode"]').waitForDisplayed();
    await capture("editor-visual");
    await $('[data-testid="code-mode"]').click();
    await $(".htnote-code-host .cm-content").waitForDisplayed();
    await capture("editor-code");

    await $(".htnote-session-actions button").click();
    await $('iframe[title="Haftalık odak planı"]').waitForExist();
    await $('[data-testid="global-search"]').click();
    await $('[data-testid="search-input"]').setValue("odak");
    await $('[data-testid="search-result"]').waitForDisplayed();
    await capture("search");
    await browser.keys(["Escape"]);

    await $('[data-testid="settings"]').click();
    await $("#settings-appearance").waitForDisplayed();
    await capture("settings");
  });
});
