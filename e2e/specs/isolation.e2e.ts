import assert from "node:assert/strict";

import { waitForApp } from "../helpers/app";
import { invoke } from "../helpers/flows";
import { readExternalOpens, waitForExternalOpen } from "../helpers/external";

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
    // The popup bridge requested a URL; top navigation still cannot escape.
    // This also proves tauri-driver's environment reached the actual application.
    await waitForExternalOpen("url", "https://example.com");
    assert.ok(!(await readExternalOpens()).some((row) => row.target.includes("iframe-denied")));
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
      html: `<html><head></head><body><script>(async () => {
        const invoke = window.__TAURI_INTERNALS__?.invoke;
        const commands = [
          ["set_preview_draft", { id: "${id}", html: "attack", css: "", js: "" }],
          ["open_external_url", { url: "https://example.com/iframe-denied" }],
          ["reveal_path", { path: "C:/iframe-denied" }],
        ];
        const denied = await Promise.all(commands.map(async ([command, args]) => {
          if (typeof invoke !== "function") return true;
          try { await invoke(command, args); return false; } catch { return true; }
        }));
        document.documentElement.dataset.invoke = denied.every(Boolean) ? "pass" : "fail";
        document.documentElement.dataset.done = "true";
      })();</script></body></html>`,
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
      assert.ok(!(await readExternalOpens()).some((row) => row.target.includes("iframe-denied")));
    }
  });

  it("records host URL, asset and reveal operations and rejects unsafe schemes", async () => {
    const logPath = process.env.HTNOTE_EXTERNAL_OPEN_LOG!;
    await invoke("open_external_url", { url: "mailto:e2e@example.com" });
    await waitForExternalOpen("url", "mailto:e2e@example.com");
    await invoke("reveal_path", { path: logPath });
    await waitForExternalOpen("reveal", logPath);
    const id = "1a8f451e-5c7a-42b9-a38b-25f9d771ea40";
    const asset = await invoke<{ relPath: string }>("save_asset_bytes", {
      noteId: id, suggestedName: "external-probe.pdf", bytes: Array.from(Buffer.from("%PDF-1.4\n%%EOF")),
    });
    const before = (await readExternalOpens()).length;
    await invoke("open_note_asset", { noteId: id, relPath: asset.relPath });
    await browser.waitUntil(async () => (await readExternalOpens()).slice(before).some((row) =>
      row.kind === "path" && row.target.endsWith("external-probe.pdf")));
    await invoke("reveal_in_explorer", { relPath: "safe-note" });
    assert.ok((await readExternalOpens()).some((row) => row.kind === "reveal" && row.target.endsWith("safe-note")));
    const count = (await readExternalOpens()).length;
    for (const url of ["javascript:alert(1)", "file:///C:/secret", "data:text/html,attack"]) {
      await assert.rejects(invoke("open_external_url", { url }));
    }
    assert.equal((await readExternalOpens()).length, count);
    assert.ok(!(await readExternalOpens()).some((row) => row.target.includes("iframe-denied")));
  });

  it("rejects traversal and executable asset requests without launching a program", async () => {
    const id = "1a8f451e-5c7a-42b9-a38b-25f9d771ea40";
    await browser.refresh();
    await waitForApp();
    await (await $(`[data-tree-key="note:${id}"]`)).click();
    const frame = await $('iframe[title="Safe Note"]');
    await frame.waitForExist();
    await browser.execute(() => {
      const host = window as unknown as {
        assetProbe?: { calls: { command: string; args?: object; code?: string }[]; restore: () => void };
      };
      const original = window.fetch;
      const calls: { command: string; args?: object; code?: string }[] = [];
      host.assetProbe = { calls, restore: () => { window.fetch = original; delete host.assetProbe; } };
      window.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        const command = decodeURIComponent(url.pathname.slice(1));
        if (url.hostname !== "ipc.localhost" || (command !== "open_note_asset" && !command.startsWith("plugin:opener|"))) {
          return original.call(window, input, init);
        }
        const args = JSON.parse(String(init?.body)) as object;
        const call: { command: string; args?: object; code?: string } = { command, args };
        calls.push(call);
        // Genel opener IPC'si regresyonda bile gerÃƒÂ§ek bir program baÃ…Å¸latamaz.
        if (command.startsWith("plugin:opener|")) {
          return new Response(JSON.stringify({ code: "UNEXPECTED_OPENER", message: "Unexpected opener IPC" }), {
            headers: { "Content-Type": "application/json", "Tauri-Response": "error" },
          });
        }
        const response = await original.call(window, input, init);
        const result = await response.clone().json() as { code?: string };
        call.code = result.code;
        return response;
      };
    });
    try {
      await browser.switchFrame(frame);
      await browser.waitUntil(async () => await browser.execute(() => document.readyState === "complete"));
      await browser.execute(() => {
        window.parent.postMessage({ type: "HTNOTE_OPEN_ASSET", relPath: "assets/../outside.pdf" }, "*");
        window.parent.postMessage({ type: "HTNOTE_OPEN_ASSET", relPath: "assets/%2e%2e/outside.pdf" }, "*");
        // Var olmayan hedef kullanÃ„Â±lÃ„Â±r; testte ÃƒÂ§alÃ„Â±Ã…Å¸tÃ„Â±rÃ„Â±labilecek bir program yoktur.
        window.parent.postMessage({ type: "HTNOTE_OPEN_ASSET", relPath: "assets/isolation-never-exists.exe", noteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, "*");
      });
      await browser.switchFrame(null);
      await browser.waitUntil(async () => await browser.execute(() => {
        const probe = (window as unknown as { assetProbe: { calls: { code?: string }[] } }).assetProbe;
        return probe.calls.some((call) => call.code === "ASSET_TYPE_BLOCKED");
      }));
      const calls = await browser.execute(() => (window as unknown as { assetProbe: { calls: object[] } }).assetProbe.calls);
      assert.deepEqual(calls, [{
        command: "open_note_asset",
        args: { noteId: id, relPath: "assets/isolation-never-exists.exe" },
        code: "ASSET_TYPE_BLOCKED",
      }]);
    } finally {
      await browser.switchFrame(null);
      await browser.execute(() => (window as unknown as { assetProbe?: { restore: () => void } }).assetProbe?.restore());
    }
  });
});
