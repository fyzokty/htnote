import assert from "node:assert/strict";

import { invoke } from "../helpers/flows";

async function isMaximized(): Promise<boolean> {
  return invoke<boolean>("plugin:window|is_maximized", { label: "main" });
}

async function waitForMaximized(expected: boolean): Promise<void> {
  await browser.waitUntil(async () => await isMaximized() === expected
    && await $('[data-testid="window-maximize"]').getAttribute("data-maximized") === String(expected), {
    timeout: 10000,
    timeoutMsg: `Window maximized state did not become ${expected}`,
  });
}

describe("custom title bar", () => {
  after(async () => {
    // Sonraki spec'ler varsayılan pencere boyutuyla başlasın.
    if (await isMaximized()) {
      await $('[data-testid="window-maximize"]').click();
      await waitForMaximized(false);
    }
  });

  it("replaces the system title bar and keeps drag regions off interactive controls", async () => {
    const layout = await browser.execute(() => {
      const header = document.querySelector<HTMLElement>('[data-testid="titlebar"]')!;
      const regions = [...header.querySelectorAll("[data-tauri-drag-region]")].map((element) => element.className);
      const interactive = [...header.querySelectorAll('button, [role="tab"], [role="tablist"]')];
      return {
        headerIsDragRegion: header.hasAttribute("data-tauri-drag-region"),
        regions,
        interactiveDragRegions: interactive.filter((element) => element.hasAttribute("data-tauri-drag-region")).length,
      };
    });
    assert.equal(layout.headerIsDragRegion, true);
    assert.equal(layout.interactiveDragRegions, 0);
    assert.ok(layout.regions.some((name) => name.includes("htnote-titlebar-spacer")));
    assert.equal(await isMaximized(), false);
  });

  it("maximizes and restores from the caption button and updates its label", async () => {
    const button = await $('[data-testid="window-maximize"]');
    const restoredLabel = await button.getAttribute("aria-label");
    await button.click();
    await waitForMaximized(true);
    assert.notEqual(await button.getAttribute("aria-label"), restoredLabel);

    await button.click();
    await waitForMaximized(false);
    assert.equal(await button.getAttribute("aria-label"), restoredLabel);
  });

  it("opens full-text search from the sidebar search button", async () => {
    await $('[data-testid="global-search"]').click();
    const dialog = await $('[role="dialog"]');
    await dialog.waitForDisplayed();
    await browser.keys("Escape");
    await dialog.waitForExist({ reverse: true });
  });
});
