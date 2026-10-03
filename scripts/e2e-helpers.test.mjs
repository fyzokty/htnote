import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../e2e/helpers/noteFrameDiagnostics", () => ({ noteFrameFailure: vi.fn() }));

import { waitForApp, waitForSavedEditor } from "../e2e/helpers/app";
import { invoke, withNoteFrame } from "../e2e/helpers/flows";
import { noteFrameFailure } from "../e2e/helpers/noteFrameDiagnostics";

function appShell() {
  document.body.innerHTML = '<button data-testid="new-note"></button><div role="tree"></div>';
}

function driver(advance = () => {}) {
  const results = [];
  const instance = {
    switchFrame: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn(async (run) => run()),
    executeAsync: vi.fn(async (run, ...args) => new Promise((done) => run(...args, done))),
    waitUntil: vi.fn(async (condition) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        advance(attempt);
        const ready = await condition();
        results.push(ready);
        if (ready) return;
      }
      throw new Error("readiness timed out");
    }),
  };
  vi.stubGlobal("browser", instance);
  return { instance, results };
}

afterEach(() => {
  delete window.__TAURI_INTERNALS__;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("e2e readiness", () => {
  it("returns to the main frame and waits for IPC injection before invoking", async () => {
    appShell();
    const command = vi.fn().mockResolvedValue("notes");
    const { instance, results } = driver((attempt) => {
      if (attempt === 2) window.__TAURI_INTERNALS__ = { invoke: command };
    });
    expect(await invoke("get_root_dir")).toBe("notes");
    expect(results).toEqual([false, false, true]);
    expect(instance.switchFrame).toHaveBeenCalledWith(null);
    expect(instance.switchFrame.mock.invocationCallOrder[0]).toBeLessThan(instance.execute.mock.invocationCallOrder[0]);
    expect(command).toHaveBeenCalledExactlyOnceWith("get_root_dir", {});
  });

  it("waits for the React shell even when IPC is already injected", async () => {
    window.__TAURI_INTERNALS__ = { invoke: vi.fn() };
    const { results } = driver((attempt) => { if (attempt === 2) appShell(); });
    await waitForApp();
    expect(results).toEqual([false, false, true]);
  });

  it("fails readiness without executing privileged commands when IPC never arrives", async () => {
    appShell();
    const { instance } = driver();
    await expect(invoke("set_root_dir", { path: "unused" })).rejects.toThrow("readiness timed out");
    expect(instance.executeAsync).not.toHaveBeenCalled();
  });

  it("waits for both save completion and the clean tab, including a hidden dirty indicator", async () => {
    document.body.innerHTML = '<button data-testid="save-note" disabled></button>'
      + '<div role="tab" aria-selected="true"><button><span class="group-hover:hidden">•</span></button></div>';
    const { results } = driver((attempt) => {
      if (attempt === 1) document.querySelector("[data-testid=save-note]").disabled = false;
      if (attempt === 2) document.querySelector("[role=tab] span").className = "hidden";
    });
    await waitForSavedEditor();
    expect(results).toEqual([false, false, true]);
  });

  it("reacquires a replaced iframe before running the note actions once", async () => {
    appShell();
    window.__TAURI_INTERNALS__ = { invoke: vi.fn().mockResolvedValue([{ type: "note", id: "test", title: "Test" }]) };
    const frame = { isExisting: vi.fn().mockResolvedValue(true) };
    vi.stubGlobal("$", vi.fn().mockResolvedValue(frame));
    const { instance } = driver();
    let replaced = false;
    instance.switchFrame.mockImplementation(async (target) => {
      if (target === frame && !replaced) {
        replaced = true;
        throw new Error("stale element reference");
      }
    });
    instance.execute.mockResolvedValue(true);
    const run = vi.fn().mockResolvedValue("content");
    expect(await withNoteFrame("test", run)).toBe("content");
    expect(run).toHaveBeenCalledTimes(1);
    expect(instance.switchFrame).toHaveBeenLastCalledWith(null);
  });

  it("restores the main frame and propagates failed note assertions without retrying", async () => {
    appShell();
    window.__TAURI_INTERNALS__ = { invoke: vi.fn().mockResolvedValue([{ type: "note", id: "test", title: "Test" }]) };
    vi.stubGlobal("$", vi.fn().mockResolvedValue({ isExisting: vi.fn().mockResolvedValue(true) }));
    const { instance } = driver();
    instance.execute.mockResolvedValue(true);
    const run = vi.fn().mockRejectedValue(new Error("security assertion failed"));
    await expect(withNoteFrame("test", run)).rejects.toThrow("security assertion failed");
    expect(run).toHaveBeenCalledTimes(1);
    expect(instance.switchFrame).toHaveBeenLastCalledWith(null);
  });

  it("adds requested link diagnostics to a failed assertion without retrying the action", async () => {
    appShell();
    const note = { type: "note", id: "test", title: "Test", relPath: "Test" };
    window.__TAURI_INTERNALS__ = { invoke: vi.fn().mockResolvedValue([note]) };
    vi.stubGlobal("$", vi.fn().mockResolvedValue({ isExisting: vi.fn().mockResolvedValue(true) }));
    const { instance } = driver();
    instance.execute.mockResolvedValue(true);
    const original = new Error("link not visible");
    const annotated = new Error("link not visible: diagnostics", { cause: original });
    vi.mocked(noteFrameFailure).mockResolvedValue(annotated);
    const run = vi.fn().mockRejectedValue(original);
    const options = { expectedHref: "htnote://note/target" };
    await expect(withNoteFrame("test", run, options)).rejects.toBe(annotated);
    expect(run).toHaveBeenCalledTimes(1);
    expect(noteFrameFailure).toHaveBeenCalledExactlyOnceWith(original, { ...note, ...options });
    expect(instance.switchFrame).toHaveBeenLastCalledWith(null);
  });
});
