import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { LivePreview } from "@/features/editor/LivePreview";
import { ipc } from "@/lib/ipc";
import { initNoteOrigin } from "@/lib/noteUrl";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const origin = "http://127.0.0.1:54321";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("debounces drafts, updates revision, restores scroll and clears on unmount", async () => {
  vi.useFakeTimers();
  initNoteOrigin(origin);
  const set = vi.spyOn(ipc, "setPreviewDraft").mockResolvedValueOnce(1).mockResolvedValueOnce(2);
  const clear = vi.spyOn(ipc, "clearPreviewDraft").mockResolvedValue();
  const view = render(<LivePreview noteId={id} html="one" css="" js="" />);
  view.rerender(<LivePreview noteId={id} html="two" css="" js="" />);
  await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); });
  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenCalledWith(id, { html: "two", css: "", js: "" });
  const frame = screen.getByTitle("Live preview") as HTMLIFrameElement;
  expect(frame.src).toBe(`${origin}/${id}/__draft/1/index.html`);
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_SCROLL", scrollY: 123 } }));
  view.rerender(<LivePreview noteId={id} html="three" css="" js="" />);
  await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); });
  expect(frame.src).toBe(`${origin}/${id}/__draft/2/index.html`);
  const post = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_READY", noteId: id } }));
  expect(post).toHaveBeenCalledWith({ type: "HTNOTE_SCROLL_RESTORE", scrollY: 123 }, origin);
  view.unmount();
  expect(clear).toHaveBeenCalledWith(id);
});

it("keeps drafts during note changes and clears pending updates after unmount", async () => {
  vi.useFakeTimers();
  initNoteOrigin(origin);
  let resolveFirst!: (revision: number) => void;
  const set = vi.spyOn(ipc, "setPreviewDraft")
    .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
    .mockResolvedValueOnce(2);
  const clear = vi.spyOn(ipc, "clearPreviewDraft").mockResolvedValue();
  const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const view = render(<LivePreview noteId={id} html="one" css="" js="" />);
  await act(async () => { vi.advanceTimersByTime(300); });
  view.rerender(<LivePreview noteId={otherId} html="two" css="" js="" />);
  expect(clear).not.toHaveBeenCalled();
  await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); });
  expect(set).toHaveBeenCalledWith(otherId, { html: "two", css: "", js: "" });
  expect((screen.getByTitle("Live preview") as HTMLIFrameElement).src).toBe(`${origin}/${otherId}/__draft/2/index.html`);
  await act(async () => { resolveFirst(1); await Promise.resolve(); });
  expect((screen.getByTitle("Live preview") as HTMLIFrameElement).src).toBe(`${origin}/${otherId}/__draft/2/index.html`);
  view.unmount();
  expect(clear).toHaveBeenCalledWith(id);
  expect(clear).toHaveBeenCalledWith(otherId);
});

it("clears a draft that finishes after unmount", async () => {
  vi.useFakeTimers();
  let resolveDraft!: (revision: number) => void;
  vi.spyOn(ipc, "setPreviewDraft").mockImplementation(() => new Promise((resolve) => { resolveDraft = resolve; }));
  const clear = vi.spyOn(ipc, "clearPreviewDraft").mockResolvedValue();
  const view = render(<LivePreview noteId={id} html="one" css="" js="" />);
  await act(async () => { vi.advanceTimersByTime(300); });
  view.unmount();
  await act(async () => { resolveDraft(1); await Promise.resolve(); });
  expect(clear).toHaveBeenCalledTimes(2);
  expect(clear).toHaveBeenCalledWith(id);
});
