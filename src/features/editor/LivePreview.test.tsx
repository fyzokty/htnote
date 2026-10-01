import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { LivePreview } from "@/features/editor/LivePreview";
import { ipc } from "@/lib/ipc";
import { initNoteOrigin, NOTE_IFRAME_SANDBOX } from "@/lib/noteUrl";

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
  await act(async () => { vi.advanceTimersByTime(299); });
  expect(set).not.toHaveBeenCalled();
  await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve(); });
  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenCalledWith(id, { html: "two", css: "", js: "" });
  const frame = screen.getByTitle("Live preview") as HTMLIFrameElement;
  expect(frame.src).toBe(`${origin}/${id}/__draft/1/index.html`);
  expect(frame.getAttribute("sandbox")).toBe(NOTE_IFRAME_SANDBOX);
  const firstPath = new URL(frame.src).pathname;
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_SCROLL", scrollY: 123, path: firstPath } }));
  view.rerender(<LivePreview noteId={id} html="three" css="" js="" />);
  await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); });
  expect(frame.src).toBe(`${origin}/${id}/__draft/2/index.html`);
  const post = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_SCROLL", scrollY: 999, path: firstPath } }));
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_READY", noteId: id, path: firstPath } }));
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_READY", noteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", path: new URL(frame.src).pathname } }));
  expect(post).not.toHaveBeenCalled();
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_READY", noteId: id, path: new URL(frame.src).pathname } }));
  expect(post).toHaveBeenCalledWith({ type: "HTNOTE_SCROLL_RESTORE", scrollY: 123 }, origin);
  view.unmount();
  expect(clear).toHaveBeenCalledWith(id);
});

it("clears the old frame and draft immediately when the note changes", async () => {
  vi.useFakeTimers();
  initNoteOrigin(origin);
  let resolveFirst!: (revision: number) => void;
  let resolveSecond!: (revision: number) => void;
  const set = vi.spyOn(ipc, "setPreviewDraft")
    .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
  const clear = vi.spyOn(ipc, "clearPreviewDraft").mockResolvedValue();
  const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const view = render(<LivePreview noteId={id} html="one" css="" js="" />);
  await act(async () => { vi.advanceTimersByTime(300); });
  view.rerender(<LivePreview noteId={otherId} html="two" css="" js="" />);
  const switchingFrame = screen.getByTitle("Live preview") as HTMLIFrameElement;
  expect(switchingFrame.getAttribute("src")).toBe("about:blank");
  expect(clear).toHaveBeenCalledWith(id);
  expect(set).toHaveBeenCalledWith(otherId, { html: "two", css: "", js: "" });
  const switchingPost = vi.spyOn(switchingFrame.contentWindow!, "postMessage").mockImplementation(() => {});
  window.dispatchEvent(new MessageEvent("message", { source: switchingFrame.contentWindow, origin, data: { type: "HTNOTE_SCROLL", scrollY: 444, path: `/${id}/__draft/1/index.html` } }));
  window.dispatchEvent(new MessageEvent("message", { source: switchingFrame.contentWindow, origin, data: { type: "HTNOTE_READY", noteId: id, path: `/${id}/__draft/1/index.html` } }));
  expect(switchingPost).not.toHaveBeenCalled();
  await act(async () => { resolveSecond(2); await Promise.resolve(); });
  expect((screen.getByTitle("Live preview") as HTMLIFrameElement).src).toBe(`${origin}/${otherId}/__draft/2/index.html`);
  const frame = screen.getByTitle("Live preview") as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_SCROLL", scrollY: 777, path: `/${id}/__draft/1/index.html` } }));
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_READY", noteId: id, path: `/${id}/__draft/1/index.html` } }));
  expect(post).not.toHaveBeenCalled();
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_READY", noteId: otherId, path: new URL(frame.src).pathname } }));
  expect(post).toHaveBeenCalledWith({ type: "HTNOTE_SCROLL_RESTORE", scrollY: 0 }, origin);
  await act(async () => { resolveFirst(1); await Promise.resolve(); });
  expect((screen.getByTitle("Live preview") as HTMLIFrameElement).src).toBe(`${origin}/${otherId}/__draft/2/index.html`);
  view.unmount();
  expect(clear).toHaveBeenCalledWith(id);
  expect(clear).toHaveBeenCalledWith(otherId);
});

it("leaves the frame blank when the new note draft fails", async () => {
  vi.useFakeTimers();
  initNoteOrigin(origin);
  vi.spyOn(ipc, "setPreviewDraft").mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("failed"));
  vi.spyOn(ipc, "clearPreviewDraft").mockResolvedValue();
  const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const view = render(<LivePreview noteId={id} html="one" css="" js="" />);
  await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); });
  expect((screen.getByTitle("Live preview") as HTMLIFrameElement).src).toBe(`${origin}/${id}/__draft/1/index.html`);
  view.rerender(<LivePreview noteId={otherId} html="two" css="" js="" />);
  await act(async () => { await Promise.resolve(); });
  expect((screen.getByTitle("Live preview") as HTMLIFrameElement).getAttribute("src")).toBe("about:blank");
  view.unmount();
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
