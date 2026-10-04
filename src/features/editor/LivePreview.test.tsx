import { act, fireEvent, render, screen } from "@testing-library/react";
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
  const frame = screen.getByTitle("Canlı önizleme") as HTMLIFrameElement;
  expect(frame.src).toBe(`${origin}/${id}/__draft/1/index.html`);
  expect(frame.closest(".htnote-preview-card")?.querySelector(".htnote-preview-header")).toHaveTextContent("Canlı önizleme");
  expect(frame.getAttribute("sandbox")).toBe(NOTE_IFRAME_SANDBOX);
  const firstPath = new URL(frame.src).pathname;
  const post = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
  fireEvent.load(frame);
  const firstToken = (post.mock.lastCall?.[0] as { token: string }).token;
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_SCROLL", scrollY: 123, path: firstPath, token: firstToken } }));
  fireEvent.load(frame);
  expect(post.mock.lastCall?.[0]).toMatchObject({ type: "HTNOTE_SCROLL_RESTORE", scrollY: 123 });
  const activeToken = (post.mock.lastCall?.[0] as { token: string }).token;
  view.rerender(<LivePreview noteId={id} html="three" css="" js="" />);
  await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); });
  expect(frame.src).toBe(`${origin}/${id}/__draft/2/index.html`);
  const secondPath = new URL(frame.src).pathname;
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_SCROLL", scrollY: 999, path: secondPath, token: activeToken } }));
  fireEvent.load(frame);
  const secondToken = (post.mock.lastCall?.[0] as { token: string }).token;
  expect(post.mock.lastCall?.[0]).toMatchObject({ type: "HTNOTE_SCROLL_RESTORE", scrollY: 123 });
  expect(secondToken).not.toBe(firstToken);
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_SCROLL", scrollY: 999, path: firstPath, token: secondToken } }));
  fireEvent.load(frame);
  expect(post.mock.lastCall?.[0]).toMatchObject({ type: "HTNOTE_SCROLL_RESTORE", scrollY: 123 });
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
  const switchingFrame = screen.getByTitle("Canlı önizleme") as HTMLIFrameElement;
  expect(switchingFrame.getAttribute("src")).toBe("about:blank");
  expect(clear).toHaveBeenCalledWith(id);
  expect(set).toHaveBeenCalledWith(otherId, { html: "two", css: "", js: "" });
  const switchingPost = vi.spyOn(switchingFrame.contentWindow!, "postMessage").mockImplementation(() => {});
  window.dispatchEvent(new MessageEvent("message", { source: switchingFrame.contentWindow, origin, data: { type: "HTNOTE_SCROLL", scrollY: 444, path: `/${id}/__draft/1/index.html` } }));
  window.dispatchEvent(new MessageEvent("message", { source: switchingFrame.contentWindow, origin, data: { type: "HTNOTE_READY", noteId: id, path: `/${id}/__draft/1/index.html` } }));
  expect(switchingPost).not.toHaveBeenCalled();
  await act(async () => { resolveSecond(2); await Promise.resolve(); });
  expect((screen.getByTitle("Canlı önizleme") as HTMLIFrameElement).src).toBe(`${origin}/${otherId}/__draft/2/index.html`);
  const frame = screen.getByTitle("Canlı önizleme") as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation(() => {});
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_SCROLL", scrollY: 777, path: `/${id}/__draft/1/index.html` } }));
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin, data: { type: "HTNOTE_READY", noteId: id, path: `/${id}/__draft/1/index.html` } }));
  expect(post).not.toHaveBeenCalled();
  fireEvent.load(frame);
  expect(post.mock.lastCall?.[0]).toMatchObject({ type: "HTNOTE_SCROLL_RESTORE", scrollY: 0 });
  await act(async () => { resolveFirst(1); await Promise.resolve(); });
  expect((screen.getByTitle("Canlı önizleme") as HTMLIFrameElement).src).toBe(`${origin}/${otherId}/__draft/2/index.html`);
  view.unmount();
  expect(clear).toHaveBeenCalledWith(id);
  expect(clear).toHaveBeenCalledWith(otherId);
});

it("shows an error when the new note draft fails", async () => {
  vi.useFakeTimers();
  initNoteOrigin(origin);
  vi.spyOn(ipc, "setPreviewDraft").mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("failed"));
  vi.spyOn(ipc, "clearPreviewDraft").mockResolvedValue();
  const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const view = render(<LivePreview noteId={id} html="one" css="" js="" />);
  await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); });
  expect((screen.getByTitle("Canlı önizleme") as HTMLIFrameElement).src).toBe(`${origin}/${id}/__draft/1/index.html`);
  view.rerender(<LivePreview noteId={otherId} html="two" css="" js="" />);
  await act(async () => { await Promise.resolve(); });
  expect((screen.getByTitle("Canlı önizleme") as HTMLIFrameElement).getAttribute("src")).toBe("about:blank");
  expect(screen.getByRole("alert")).toHaveTextContent("Önizleme yüklenemedi.");
  expect(screen.getByRole("button", { name: "Yeniden dene" })).toBeEnabled();
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


it("waits for the current iframe content and ignores stale or untrusted readiness messages", async () => {
  vi.useFakeTimers();
  initNoteOrigin(origin);
  vi.spyOn(ipc, "setPreviewDraft").mockResolvedValue(1);
  vi.spyOn(ipc, "clearPreviewDraft").mockResolvedValue();
  render(<LivePreview noteId={id} html="one" css="" js="" />);
  expect(screen.getByRole("status")).toHaveTextContent("Yükleniyor");
  await act(async () => { vi.advanceTimersByTime(300); });
  const frame = screen.getByTitle("Canlı önizleme") as HTMLIFrameElement;
  fireEvent.load(frame);
  expect(screen.getByTestId("live-preview")).toHaveAttribute("data-loaded", "false");
  const ready = { type: "HTNOTE_READY", noteId: id, path: new URL(frame.src).pathname };
  fireEvent(window, new MessageEvent("message", { source: frame.contentWindow, origin: "http://evil.example", data: ready }));
  fireEvent(window, new MessageEvent("message", { source: frame.contentWindow, origin, data: { ...ready, path: "/old" } }));
  expect(screen.getByRole("status")).toBeInTheDocument();
  fireEvent(window, new MessageEvent("message", { source: frame.contentWindow, origin, data: ready }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByTestId("live-preview")).toHaveAttribute("data-loaded", "true");
});

it("times out a missing iframe handshake and retries the draft", async () => {
  vi.useFakeTimers();
  initNoteOrigin(origin);
  const set = vi.spyOn(ipc, "setPreviewDraft").mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce(2);
  vi.spyOn(ipc, "clearPreviewDraft").mockResolvedValue();
  render(<LivePreview noteId={id} html="one" css="" js="" />);
  await act(async () => { vi.advanceTimersByTime(300); });
  expect(screen.getByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Yeniden dene" }));
  expect(screen.getByRole("status")).toBeInTheDocument();
  await act(async () => { vi.advanceTimersByTime(300); });
  expect(set).toHaveBeenCalledTimes(2);
  expect((screen.getByTitle("Canlı önizleme") as HTMLIFrameElement).src).toContain("/__draft/2/");
  await act(async () => { vi.advanceTimersByTime(10_000); });
  expect(screen.getByRole("alert")).toBeInTheDocument();
});
