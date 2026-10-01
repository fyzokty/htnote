import { mockIPC } from "@tauri-apps/api/mocks";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useEditSession } from "@/features/editor/useEditSession";
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
    mockIPC((command) => {
      if (command === "read_note") return note;
      if (command === "save_note") throw { code: "CONFLICT", message: "changed" };
    });
    const { result } = renderHook(() => useEditSession("a"));
    await act(async () => { await result.current.enter(); });
    act(() => result.current.onVisualChange("<p>Unsaved</p>"));
    await act(async () => { expect(await result.current.save()).toBe(false); });
    expect(doc()).toMatchObject({ mode: "visual", dirty: true, saving: false });
    expect(doc().draft?.html).toContain("Unsaved");
    expect(useUiStore.getState().toasts.slice(-1)[0]?.messageKey).toBe("editor.session.conflict");
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
