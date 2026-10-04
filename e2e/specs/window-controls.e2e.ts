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
      const caption = [...header.querySelectorAll<HTMLElement>(".htnote-caption-button")].map((button) => button.getBoundingClientRect());
      return {
        headerIsDragRegion: header.hasAttribute("data-tauri-drag-region"),
        regions,
        interactiveDragRegions: interactive.filter((element) => element.hasAttribute("data-tauri-drag-region")).length,
        headerHeight: header.getBoundingClientRect().height,
        caption: caption.map((rect) => ({ width: Math.round(rect.width), height: Math.round(rect.height), right: Math.round(rect.right), top: Math.round(rect.top) })),
        viewport: window.innerWidth,
      };
    });
    assert.equal(layout.headerIsDragRegion, true);
    assert.equal(layout.interactiveDragRegions, 0);
    assert.ok(layout.regions.some((name) => name.includes("htnote-titlebar-spacer")));
    assert.equal(layout.headerHeight, 48);
    assert.equal(layout.caption.length, 3);
    for (const rect of layout.caption) assert.deepEqual([rect.width, rect.height, rect.top], [46, 48, 0]);
    assert.equal(layout.caption[2].right, layout.viewport, "Close button must sit in the top-right corner");
    assert.equal(await isMaximized(), false);
  });

  it("maximizes and restores from the caption button and updates its label", async () => {
    const button = await $('[data-testid="window-maximize"]');
    const restoredLabel = await button.getAttribute("aria-label");
    await button.click();
    await waitForMaximized(true);
    assert.notEqual(await button.getAttribute("aria-label"), restoredLabel);
    assert.equal(await $('[data-testid="window-maximize"] [data-icon="restore"]').isExisting(), true);

    await button.click();
    await waitForMaximized(false);
    assert.equal(await button.getAttribute("aria-label"), restoredLabel);
    assert.equal(await $('[data-testid="window-maximize"] [data-icon="maximize"]').isExisting(), true);
  });

  it("opens full-text search from the sidebar search button", async () => {
    await $('[data-testid="global-search"]').click();
    const dialog = await $('[role="dialog"]');
    await dialog.waitForDisplayed();
    await browser.keys("Escape");
    await dialog.waitForExist({ reverse: true });
  });
});
