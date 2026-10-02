export async function waitForApp(): Promise<void> {
  // Yeni WebDriver oturumu about:blank'te başlayabilir; iframe bağlamı da taşınabilir.
  await browser.switchFrame(null);
  await browser.waitUntil(async () => browser.execute(() => {
    const api = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__;
    return window === window.top && document.readyState === "complete"
      && typeof api?.invoke === "function"
      && document.querySelector('[data-testid="new-note"]') !== null
      && document.querySelector('[role="tree"]') !== null;
  }), { timeout: 30000, interval: 100, timeoutMsg: "Main app and Tauri IPC did not become ready" });
}

export async function waitForSavedEditor(): Promise<void> {
  // Dosya, IPC yanıtından önce yazılır; yalnızca disk kontrolü saving yarışını çözmez.
  await browser.waitUntil(async () => browser.execute(() => {
    const save = document.querySelector<HTMLButtonElement>('[data-testid="save-note"]');
    const tab = document.querySelector('[role="tab"][aria-selected="true"]');
    const dirty = tab?.querySelector("button > span");
    return save !== null && !save.disabled && dirty?.classList.contains("hidden") === true;
  }), { timeout: 30000, interval: 100, timeoutMsg: "Editor did not acknowledge the saved note" });
}
