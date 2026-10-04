import { mockIPC } from "@tauri-apps/api/mocks";
import { createElement } from "react";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";

import { useEditSession } from "@/features/editor/useEditSession";
import { VisualEditor } from "@/features/editor/VisualEditor";
import { loadForVisual, visualContentIndent } from "@/features/editor/visualPipeline";
import type { UnsavedDecision } from "@/features/editor/unsavedGuard";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";

const html = '<html><main id="htnote-content"><p>First</p></main></html>';
const note = { html, css: null, js: null, contentHash: "old", metadata: { id: "a", title: "A" } };
const doc = () => useTabsStore.getState().tabs[0].doc;
async function decide(decision: UnsavedDecision) {
  await act(async () => { useUiStore.getState().unsavedDialog?.resolve(decision); });
}

beforeEach(() => {
  resetTabsStoreForTests();
  useTabsStore.getState().openNote("a");
  useUiStore.setState({ toasts: [] });
});

describe("useEditSession", () => {
  it("saves a clean document and returns to view mode", async () => {
    const commands: string[] = [];
    mockIPC((command) => {
      commands.push(command);
      if (command === "read_note") return note;
      if (command === "save_note") return { contentHash: "new", metadata: note.metadata };
    });
    const { result } = renderHook(() => useEditSession("a"));
    await act(async () => { await result.current.enter(); });
    expect(doc().dirty).toBe(false);
    await act(async () => { expect(await result.current.save(false)).toBe(true); });
    expect(commands).toContain("save_note");
    expect(doc()).toMatchObject({ mode: "view", dirty: false, saving: false });
  });

  it("keeps a visual edit made during save before its debounce fires", async () => {
    vi.useFakeTimers();
    try {
      let completeSave!: (value: { contentHash: string }) => void;
      const saved = new Promise<{ contentHash: string }>((resolve) => { completeSave = resolve; });
      const payloads: unknown[] = [];
      mockIPC((command, args) => {
        if (command === "read_note") return note;
        if (command === "save_note") {
          payloads.push((args as { payload: unknown }).payload);
          return payloads.length === 1 ? saved : { contentHash: "latest" };
        }
      });
      const { result } = renderHook(() => useEditSession("a"));
      await act(async () => { await result.current.enter(); });
      render(createElement(VisualEditor, { ref: result.current.visualRef, initialInner: "<p>First</p>", onChange: result.current.onVisualChange }));
      const editor = (screen.getByRole("textbox", { name: "Not içeriği" }) as HTMLElement & { editor: Editor }).editor;
      act(() => { editor.commands.insertContentAt(6, " saved"); });
      let saving!: Promise<boolean>;
      act(() => { saving = result.current.save(false); });
      act(() => { editor.commands.insertContentAt(12, " newer"); });
      await act(async () => { completeSave({ contentHash: "new" }); expect(await saving).toBe(true); });
      expect(doc()).toMatchObject({ mode: "visual", dirty: true, saving: false });
      expect(doc().base?.html).not.toContain("newer");
      expect(doc().draft?.html).toContain("newer");
      await act(async () => { expect(await result.current.save(false)).toBe(true); });
      expect(payloads[1]).toMatchObject({ expectedHash: "new", html: expect.stringContaining("newer") });
      expect(doc().mode).toBe("view");
    } finally { vi.useRealTimers(); }
  });

  it("flushes readable visual HTML into save_note while preserving the shell, assets and hash", async () => {
    const original = '<!DOCTYPE html>\n<html><head><style>body { color: red; }</style></head><body>\n  <main id="htnote-content"><p>First</p><p>Second</p><div> raw\r\n  <span> untouched </span></div></main><script>outside()</script></body></html>';
    const parts = loadForVisual(original);
    if (!parts.ok) throw new Error(parts.reason);
    const payloads: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "read_note") return { ...note, html: original, css: "p {}", js: "run()" };
      if (command === "save_note") {
        payloads.push((args as { payload: unknown }).payload);
        return { contentHash: "new", metadata: note.metadata };
      }
    });
    const { result } = renderHook(() => useEditSession("a"));
    await act(async () => { await result.current.enter(); });
    render(createElement(VisualEditor, { ref: result.current.visualRef, initialInner: parts.inner,
      contentIndent: visualContentIndent(parts), onChange: result.current.onVisualChange }));
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Başlık 2" }));
    await act(async () => { expect(await result.current.save(true)).toBe(true); });
    const expected = parts.before + '\n    <h2>First</h2>\n    <p>Second</p>\n    <div> raw\r\n  <span> untouched </span></div>\n  ' + parts.after;
    expect(payloads).toEqual([{ html: expected, css: "p {}", js: "run()", expectedHash: "old" }]);
    expect(doc()).toMatchObject({ dirty: false, base: { html: expected, contentHash: "new" } });
  });
  it("enters visual mode, preserves changes across modes, and saves to view with the original hash", async () => {
    const commands: string[] = [];
    mockIPC((command, args) => {
      commands.push(command);
      if (command === "read_note") return note;
      if (command === "save_note") {
        expect(args).toMatchObject({ id: "a", payload: { expectedHash: "old", html: expect.stringContaining("Second") } });
        return { contentHash: "new", metadata: note.metadata };
      }
    });
    const { result } = renderHook(() => useEditSession("a"));
    await act(async () => { await result.current.enter(); });
    expect(doc().mode).toBe("visual");
    act(() => result.current.onVisualChange("<p>Second</p>"));
    act(() => result.current.switchMode("code"));
    expect(doc().draft?.html).toContain("Second");
    act(() => result.current.switchMode("visual"));
    expect(doc().dirty).toBe(true);
    await act(async () => { await result.current.save(); });
    expect(doc()).toMatchObject({ mode: "view", dirty: false, base: { contentHash: "new" } });
    expect(commands).toContain("clear_preview_draft");
  });

  it("keeps a clean draft clean across switches and Ctrl+S stays in edit mode", async () => {
    mockIPC((command) => command === "read_note" ? note : command === "save_note" ? { contentHash: "new", metadata: note.metadata } : undefined);
    const { result } = renderHook(() => useEditSession("a"));
    await act(async () => { await result.current.enter(); });
    act(() => { result.current.switchMode("code"); result.current.switchMode("visual"); });
    expect(doc().dirty).toBe(false);
    expect(doc().draft?.html).toBe(html);
    await act(async () => { await result.current.save(true); });
    expect(doc().mode).toBe("visual");
  });

  it("cancels clean edits directly and asks before discarding dirty edits", async () => {
    mockIPC((command) => command === "read_note" ? note : undefined);
    const { result } = renderHook(() => useEditSession("a"));
    await act(async () => { await result.current.enter(); });
    await act(async () => { await result.current.cancel(); });
    await act(async () => { await result.current.enter(); });
    act(() => result.current.onVisualChange("<p>Changed</p>"));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.cancel(); });
    await decide("cancel");
    await pending;
    expect(doc().mode).toBe("visual");
    act(() => { pending = result.current.cancel(); });
    await decide("discard");
    await pending;
    expect(doc().mode).toBe("view");
  });

  it("saves a dirty edit on cancel without discarding the saved content", async () => {
    let saves = 0;
    mockIPC((command) => {
      if (command === "read_note") return note;
      if (command === "save_note") { saves++; return { contentHash: "new", metadata: note.metadata }; }
    });
    const { result } = renderHook(() => useEditSession("a"));
    await act(async () => { await result.current.enter(); });
    act(() => result.current.onVisualChange("<p>Saved</p>"));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.cancel(); });
    await decide("save");
    expect(await pending).toBe(true);
    expect(saves).toBe(1);
    expect(doc()).toMatchObject({ mode: "view", dirty: false, base: { contentHash: "new" } });
    expect(doc().base?.html).toContain("Saved");
  });

  it("keeps editing after a failed Save decision in cancel and Ctrl+E", async () => {
    mockIPC((command) => {
      if (command === "read_note") return note;
      if (command === "save_note") throw { code: "IO_ERROR" };
    });
    const { result } = renderHook(() => useEditSession("a"));
    await act(async () => { await result.current.enter(); });
    act(() => result.current.onVisualChange("<p>Unsaved</p>"));
    let pendingCancel!: Promise<boolean>;
    act(() => { pendingCancel = result.current.cancel(); });
    await decide("save");
    expect(await pendingCancel).toBe(false);
    expect(doc()).toMatchObject({ mode: "visual", dirty: true });
    let pendingToggle!: Promise<void>;
    act(() => { pendingToggle = result.current.toggleEdit(); });
    await decide("save");
    await pendingToggle;
    expect(doc()).toMatchObject({ mode: "visual", dirty: true });
  });

  it("starts in code when no content region exists and blocks invalid code to visual transitions", async () => {
    mockIPC((command) => command === "read_note" ? { ...note, html: "<html></html>" } : undefined);
    const { result } = renderHook(() => useEditSession("a"));
    await act(async () => { await result.current.enter(); });
    expect(doc()).toMatchObject({ mode: "code", visualAvailable: false });
    act(() => result.current.onCodeChange({ html: "<script>run()</script>" }));
    act(() => result.current.switchMode("visual"));
    expect(doc().mode).toBe("code");
    expect(doc().draft?.html).toBe("<script>run()</script>");
    expect(useUiStore.getState().toasts.slice(-1)[0]?.messageKey).toBe("editor.session.visualUnavailable");
    act(() => result.current.onCodeChange({ html }));
    act(() => result.current.switchMode("visual"));
    expect(doc()).toMatchObject({ mode: "visual", visualAvailable: true, dirty: true });
  });

  it("preserves the draft and reports a conflict", async () => {
    let reads = 0;
    mockIPC((command) => {
      if (command === "read_note") return reads++ === 0 ? note : { ...note, contentHash: "disk" };
      if (command === "save_note") throw { code: "CONFLICT", message: "changed" };
    });
    const { result } = renderHook(() => useEditSession("a"));
    await act(async () => { await result.current.enter(); });
    act(() => result.current.onVisualChange("<p>Unsaved</p>"));
    await act(async () => { expect(await result.current.save()).toBe(false); });
    expect(doc()).toMatchObject({ mode: "visual", dirty: true, saving: false });
    expect(doc().draft?.html).toContain("Unsaved");
    expect(doc().externalConflict).toBe("disk");
  });

  it("keeps edits made while saving and uses the new hash for the next save", async () => {
    let completeSave!: (value: { contentHash: string; metadata: typeof note.metadata }) => void;
    const firstSave = new Promise<{ contentHash: string; metadata: typeof note.metadata }>((resolve) => { completeSave = resolve; });
    const hashes: string[] = [];
    mockIPC((command, args) => {
      if (command === "read_note") return note;
      if (command === "save_note") {
        hashes.push((args as { payload: { expectedHash: string } }).payload.expectedHash);
        return hashes.length === 1 ? firstSave : { contentHash: "latest", metadata: note.metadata };
      }
    });
    const { result } = renderHook(() => useEditSession("a"));
    await act(async () => { await result.current.enter(); });
    act(() => result.current.onVisualChange("<p>Saved snapshot</p>"));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.save(false); });
    act(() => result.current.onVisualChange("<p>Newer edit</p>"));
    await act(async () => { completeSave({ contentHash: "new", metadata: note.metadata }); await pending; });
    expect(doc()).toMatchObject({ mode: "visual", dirty: true, base: { contentHash: "new" } });
    expect(doc().draft?.html).toContain("Newer edit");
    await act(async () => { await result.current.save(true); });
    expect(hashes).toEqual(["old", "new"]);
  });

  it("offers save, discard, and stay in edit mode for dirty Ctrl+E", async () => {
    mockIPC((command) => command === "read_note" ? note : command === "save_note" ? { contentHash: "new", metadata: note.metadata } : undefined);
    const { result } = renderHook(() => useEditSession("a"));
    await act(async () => { await result.current.enter(); });
    act(() => result.current.onVisualChange("<p>Changed</p>"));
    let pending!: Promise<void>;
    act(() => { pending = result.current.toggleEdit(); });
    await decide("cancel");
    await pending;
    expect(doc().mode).toBe("visual");
    act(() => { pending = result.current.toggleEdit(); });
    await decide("discard");
    await pending;
    expect(doc().mode).toBe("view");
    await act(async () => { await result.current.enter(); });
    act(() => result.current.onVisualChange("<p>Saved</p>"));
    act(() => { pending = result.current.toggleEdit(); });
    await decide("save");
    await pending;
    expect(doc()).toMatchObject({ mode: "view", base: { contentHash: "new" } });
  });
});
