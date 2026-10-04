import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createDocState } from "@/features/editor/docState";
import i18n from "@/i18n";
import { ipc } from "@/lib/ipc";
import { NoteStatusBar } from "./NoteStatusBar";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); void i18n.changeLanguage("tr"); });
it("shows clean, dirty and saving states with localized counts from the live draft", async () => {
  vi.useFakeTimers();
  vi.spyOn(ipc, "readNote").mockResolvedValue({ html: "<p>old</p>" } as Awaited<ReturnType<typeof ipc.readNote>>);
  const doc = { ...createDocState(), mode: "code" as const, draft: { html: "<p>bir iki</p>", css: null, js: null } };
  const { rerender } = render(<NoteStatusBar id="a" doc={doc} updatedAt="" />);
  expect(screen.getByRole("status")).toHaveTextContent("Diske kaydedildi");
  await act(() => vi.advanceTimersByTimeAsync(250));
  expect(screen.getByTestId("note-counts")).toHaveTextContent("2 Kelime \u00b7 7 Karakter");
  rerender(<NoteStatusBar id="a" doc={{ ...doc, dirty: true }} updatedAt="" />);
  expect(screen.getByRole("status")).toHaveTextContent("Kaydedilmedi");
  rerender(<NoteStatusBar id="a" doc={{ ...doc, dirty: true, saving: true }} updatedAt="" />);
  expect(screen.getByRole("status")).toHaveTextContent("Kaydediliyor\u2026");
});
it("debounces HTML changes and does not recount CSS changes", async () => {
  vi.useFakeTimers();
  const doc = { ...createDocState(), mode: "visual" as const, draft: { html: "<p>bir</p>", css: null, js: null } };
  const { rerender } = render(<NoteStatusBar id="a" doc={doc} updatedAt="" />);
  await act(() => vi.advanceTimersByTimeAsync(200));
  rerender(<NoteStatusBar id="a" doc={{ ...doc, draft: { ...doc.draft, html: "<p>bir iki</p>" } }} updatedAt="" />);
  await act(() => vi.advanceTimersByTimeAsync(249));
  expect(screen.queryByTestId("note-counts")).not.toBeInTheDocument();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(screen.getByTestId("note-counts")).toHaveTextContent("2 Kelime");
  rerender(<NoteStatusBar id="a" doc={{ ...doc, draft: { ...doc.draft, html: "<p>bir iki</p>", css: "p{}" } }} updatedAt="" />);
  expect(screen.getByTestId("note-counts")).toHaveTextContent("2 Kelime");
});

it("reads saved HTML and ignores a late read from an older revision", async () => {
  vi.useFakeTimers();
  let finishOld: ((value: Awaited<ReturnType<typeof ipc.readNote>>) => void) | undefined;
  vi.spyOn(ipc, "readNote").mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValue({ html: "<p>new disk text</p>" } as Awaited<ReturnType<typeof ipc.readNote>>);
  const doc = createDocState();
  const { rerender } = render(<NoteStatusBar id="a" doc={doc} updatedAt="old" />);
  rerender(<NoteStatusBar id="a" doc={doc} updatedAt="new" />);
  await act(async () => { await Promise.resolve(); });
  await act(() => vi.advanceTimersByTimeAsync(250));
  expect(screen.getByTestId("note-counts")).toHaveTextContent("3 Kelime");
  await act(async () => { finishOld?.({ html: "<p>old</p>" } as Awaited<ReturnType<typeof ipc.readNote>>); });
  await act(() => vi.advanceTimersByTimeAsync(250));
  expect(screen.getByTestId("note-counts")).toHaveTextContent("3 Kelime");
});
it("counts off-thread, ignores stale worker replies and does not resubmit CSS edits", async () => {
  vi.useFakeTimers();
  const worker = { onmessage: null as null | ((event: { data: { revision: number; counts: { words: number; characters: number } } }) => void), postMessage: vi.fn(), terminate: vi.fn() };
  vi.stubGlobal("Worker", class { constructor() { return worker; } });
  const doc = { ...createDocState(), mode: "code" as const, draft: { html: "one", css: null, js: null } };
  const { rerender, unmount } = render(<NoteStatusBar id="a" doc={doc} updatedAt="" />);
  await act(() => vi.advanceTimersByTimeAsync(250));
  const old = worker.postMessage.mock.calls[0][0].revision as number;
  const next = { ...doc, draft: { ...doc.draft, html: "one two" } };
  rerender(<NoteStatusBar id="a" doc={next} updatedAt="" />);
  await act(() => vi.advanceTimersByTimeAsync(250));
  const current = worker.postMessage.mock.calls[1][0].revision as number;
  act(() => worker.onmessage?.({ data: { revision: old, counts: { words: 1, characters: 3 } } }));
  expect(screen.queryByTestId("note-counts")).not.toBeInTheDocument();
  act(() => worker.onmessage?.({ data: { revision: current, counts: { words: 2, characters: 7 } } }));
  expect(screen.getByTestId("note-counts")).toHaveTextContent("2 Kelime");
  rerender(<NoteStatusBar id="a" doc={{ ...next, draft: { ...next.draft, css: "p {}" } }} updatedAt="" />);
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
  unmount();
  expect(worker.terminate).toHaveBeenCalledOnce();
});
it("uses English plurals and locale number separators", async () => {
  vi.useFakeTimers();
  await i18n.changeLanguage("en");
  const doc = { ...createDocState(), mode: "code" as const, draft: { html: `<p>${"a".repeat(2480)}</p>`, css: null, js: null } };
  render(<NoteStatusBar id="a" doc={doc} updatedAt="" />);
  await act(() => vi.advanceTimersByTimeAsync(250));
  expect(screen.getByTestId("note-counts")).toHaveTextContent("1 word \u00b7 2,480 characters");
});

it.each(["error", "messageerror", "timeout", "postMessage", "constructor"])("falls back to saved HTML when the worker fails: %s", async (failure) => {
  vi.useFakeTimers();
  const worker = { onmessage: null, onerror: null as null | (() => void), onmessageerror: null as null | (() => void),
    postMessage: vi.fn(() => { if (failure === "postMessage") throw new Error("unavailable"); }), terminate: vi.fn() };
  vi.stubGlobal("Worker", class { constructor() { if (failure === "constructor") throw new Error("unavailable"); return worker; } });
  vi.spyOn(ipc, "readNote").mockResolvedValue({ html: "<p>saved note</p>" } as Awaited<ReturnType<typeof ipc.readNote>>);
  const { unmount } = render(<NoteStatusBar id="a" doc={createDocState()} updatedAt="" />);
  await act(async () => { await Promise.resolve(); });
  await act(() => vi.advanceTimersByTimeAsync(250));
  if (failure === "error") act(() => worker.onerror?.());
  if (failure === "messageerror") act(() => worker.onmessageerror?.());
  if (failure === "timeout") await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(screen.getByTestId("note-counts")).toHaveTextContent("2 Kelime · 10 Karakter");
  if (failure !== "constructor") expect(worker.terminate).toHaveBeenCalled();
  unmount();
});
