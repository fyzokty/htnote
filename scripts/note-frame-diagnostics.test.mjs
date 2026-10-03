import { afterEach, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal();
  const mocks = { mkdir: vi.fn(), readFile: vi.fn(), writeFile: vi.fn() };
  return { ...actual, ...mocks, default: { ...actual.default, ...mocks } };
});

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { noteFrameFailure } from "../e2e/helpers/noteFrameDiagnostics";

afterEach(() => {
  document.body.innerHTML = "";
  delete window.__TAURI_INTERNALS__;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setup() {
  const href = "htnote://note/target";
  const target = { id: "source", title: "Source", relPath: "Source", expectedHref: href };
  document.body.innerHTML = '<div role="tab" aria-selected="true" data-note-id="source"></div>'
    + '<div data-mode="visual"></div>'
    + '<div data-mode="view" data-note-id="source" data-revision="2:1" data-loaded-revision="1:0" data-editing="true" data-saving="false" inert aria-hidden="true">'
    + '<iframe title="Source" src="http://notes.invalid/source/?revision=2%3A1"></iframe></div>';
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    toJSON: () => ({ x: 0, y: 0, width: 500, height: 400 }),
  });
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}]);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  window.__TAURI_INTERNALS__ = { invoke: vi.fn().mockResolvedValue("C:/notes") };
  const frame = {};
  vi.stubGlobal("$", vi.fn().mockResolvedValue(frame));
  const browser = {
    switchFrame: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn(async (run, ...args) => run(...args)),
    executeAsync: vi.fn(async (run) => new Promise((done) => run(done))),
  };
  vi.stubGlobal("browser", browser);
  vi.mocked(readFile).mockResolvedValue(`<main id="htnote-content"><a href="${href}">Target</a></main>`);
  vi.mocked(mkdir).mockResolvedValue(undefined);
  vi.mocked(writeFile).mockResolvedValue(undefined);
  return { target, browser, frame };
}

it("reports the saved link, host revisions and editing state even if the iframe detaches", async () => {
  const { target, browser, frame } = setup();
  browser.switchFrame.mockImplementation(async (value) => {
    if (value === frame) throw new Error("no such frame");
  });
  const original = new Error("link did not become visible");
  const failure = await noteFrameFailure(original, target);
  expect(failure.cause).toBe(original);
  expect(failure.message).toContain(original.message);
  const report = JSON.parse(vi.mocked(writeFile).mock.calls[0][1]);
  expect(report.host).toMatchObject({
    activeTab: "source", activeMode: "visual", revision: "2:1", loadedRevision: "1:0",
    editing: "true", saving: "false",
    frame: { src: "http://notes.invalid/source/?revision=2%3A1", rect: { width: 500, height: 400 }, container: { inert: true, ariaHidden: "true" } },
  });
  expect(report.failedContext.readyState).toBe(document.readyState);
  expect(report.currentFrame.error).toContain("no such frame");
  expect(report.disk.containsLink).toBe(true);
  expect(report.disk.html).toContain(target.expectedHref);
  expect(failure.message).toContain(JSON.stringify(report, null, 2));
  expect(browser.switchFrame).toHaveBeenLastCalledWith(null);
});

it("preserves the assertion and other probes when disk reading and log writing fail", async () => {
  const { target, browser } = setup();
  vi.mocked(readFile).mockRejectedValue(new Error("disk unavailable"));
  vi.mocked(writeFile).mockRejectedValue(new Error("log unavailable"));
  const original = new Error("assertion failed");
  const failure = await noteFrameFailure(original, target);
  expect(failure.cause).toBe(original);
  expect(failure.message).toContain("assertion failed");
  expect(failure.message).toContain("disk unavailable");
  expect(failure.message).toContain("log unavailable");
  expect(failure.message).toContain('"containsLink": false');
  expect(browser.switchFrame).toHaveBeenLastCalledWith(null);
});
