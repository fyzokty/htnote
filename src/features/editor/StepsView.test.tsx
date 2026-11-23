import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { Editor } from "@tiptap/core";
import { open } from "@tauri-apps/plugin-dialog";
import { closeHistory } from "@tiptap/pm/history";
import { VisualEditor, type VisualEditorHandle } from "./VisualEditor";
import { emptyStep, serializeSteps } from "./steps";
import { serializeBoard } from "./board";
import { getDropHandler } from "./fileDrop";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
const initial = serializeSteps({ title: "", items: [], html: null });
const headings = () => screen.getAllByTestId("steps-heading") as HTMLTextAreaElement[];
const descriptions = () => screen.getAllByTestId("steps-text") as HTMLTextAreaElement[];
const change = async (element: HTMLElement, value: string) => act(async () => { fireEvent.change(element, { target: { value } }); });
const click = async (name: string) => act(async () => { fireEvent.click(screen.getByRole("button", { name })); });
const key = async (element: HTMLElement, key: string, extra = {}) => act(async () => { fireEvent.keyDown(element, { key, ...extra }); });

describe("StepsView", () => {
  it("changes attributes, adds, removes and moves steps, navigates and uses undo and the draft pipeline", async () => {
    const ref = createRef<VisualEditorHandle>(), onChange = vi.fn();
    const { unmount } = render(<VisualEditor ref={ref} initialInner={initial} onChange={onChange} />);
    const editor = (screen.getByRole("textbox", { name: "Not içeriği" }) as HTMLElement & { editor: Editor }).editor;
    const items = () => editor.state.doc.firstChild?.attrs.items;
    try {
      expect(items()).toEqual([]);
      await change(screen.getByTestId("steps-title"), "Guide");
      await key(screen.getByTestId("steps-title"), "Enter"); expect(headings()[0]).toHaveFocus();
      await change(headings()[0], "First"); await key(headings()[0], "Enter"); expect(descriptions()[0]).toHaveFocus();
      await change(descriptions()[0], "Line 1\nLine 2");
      await click("Adım ekle"); expect(headings()[1]).toHaveFocus();
      await change(headings()[1], "Second"); await click("Adım 2 yukarı taşı");
      expect(items()[0].heading).toBe("Second"); expect(headings()[0]).toHaveFocus();
      await key(headings()[0], "ArrowDown", { altKey: true, shiftKey: true });
      expect(items()[0].heading).toBe("First"); expect(headings()[1]).toHaveFocus();
      expect(editor.state.doc.firstChild?.type.name).toBe("steps");
      await key(headings()[1], "ArrowUp", { altKey: true, shiftKey: true }); expect(items()[0].heading).toBe("Second");
      await click("Adım 1 aşağı taşı"); expect(items()[0].heading).toBe("First");
      await click("Adım ekle"); await key(headings()[2], "Backspace"); expect(headings()).toHaveLength(2);
      await act(async () => { fireEvent.click(screen.getAllByTestId("steps-add-code")[0]); });
      await change(screen.getByTestId("steps-code"), "\n<&>\r\ncommand");
      expect(items()[0].code).toBe("\n<&>\ncommand");
      act(() => { ref.current?.flush(); });
      expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('<pre class="htnote-steps-code">\n&#10;&lt;&amp;&gt;\ncommand</pre>'));
      await click("Kodu kaldır"); expect(items()[0].code).toBeNull();
      act(() => editor.view.dispatch(closeHistory(editor.state.tr)));
      await change(headings()[0], "Changed"); await key(headings()[0], "z", { ctrlKey: true }); expect(items()[0].heading).toBe("First");
      await key(headings()[0], "y", { ctrlKey: true }); expect(items()[0].heading).toBe("Changed");
      descriptions()[1].setSelectionRange(0, 0); await key(descriptions()[1], "ArrowUp"); expect(headings()[1]).toHaveFocus();
      await key(descriptions()[1], "ArrowDown"); expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      await click("Adım 2 sil"); expect(headings()).toHaveLength(1);
      const shortcut = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }); headings()[0].dispatchEvent(shortcut); expect(shortcut.defaultPrevented).toBe(false);
      await click("Adım 1 sil"); expect(items()).toEqual([emptyStep()]);
      await key(headings()[0], "Backspace"); expect(headings()).toHaveLength(1);
    } finally { unmount(); }
  });
  it("keeps Alt+Shift moves inside the widget when it is in a board cell", async () => {
    const html = serializeSteps({ title: "", html: null, items: [{ ...emptyStep(), heading: "First" }, { ...emptyStep(), heading: "Second" }] });
    render(<VisualEditor initialInner={serializeBoard([{ col: 1, span: 6, row: 1, html }])} onChange={vi.fn()} />);
    await key(headings()[1], "ArrowUp", { altKey: true, shiftKey: true });
    const editor = (screen.getByRole("textbox", { name: "Not içeriği" }) as HTMLElement & { editor: Editor }).editor;
    expect(editor.state.doc.firstChild?.type.name).toBe("board");
    expect(editor.state.doc.firstChild?.firstChild?.firstChild?.attrs.items[0].heading).toBe("Second");
  });
  it("keeps an asynchronous image import attached to its edited/moved step and ignores a deleted target", async () => {
    let resolve!: (value: { relPath: string; kind: string; mime: string }) => void;
    mockIPC(() => new Promise((done) => { resolve = done; }));
    vi.mocked(open).mockResolvedValue("C:\\image.png");
    const { unmount } = render(<VisualEditor initialInner={initial} onChange={vi.fn()} />);
    const editor = (screen.getByRole("textbox", { name: "Not içeriği" }) as HTMLElement & { editor: Editor }).editor;
    try {
      await click("Adım ekle");
      await act(async () => { fireEvent.click(screen.getAllByTestId("steps-add-image")[0]); });
      await change(headings()[0], "Edited while copying");
      await key(headings()[0], "ArrowDown", { altKey: true, shiftKey: true });
      await act(async () => { resolve({ relPath: "assets/moved.png", kind: "image", mime: "image/png" }); });
      expect(editor.state.doc.firstChild?.attrs.items[1]).toMatchObject({ heading: "Edited while copying", image: { src: "assets/moved.png" } });
      expect(editor.state.doc.firstChild?.attrs.items[0].image).toBeNull();
      await click("Adım 2 sil");
      await act(async () => { fireEvent.click(screen.getByTestId("steps-add-image")); });
      await click("Adım 1 sil");
      await act(async () => { resolve({ relPath: "assets/deleted.png", kind: "image", mime: "image/png" }); });
      expect(editor.state.doc.firstChild?.attrs.items).toEqual([emptyStep()]);
    } finally { unmount(); vi.mocked(open).mockReset(); }
  });
  it("copies picked/native dropped images, saves pasted/dropped bytes and changes/removes the image", async () => {
    const calls = vi.fn((command: string, args: unknown) => { void args; if (["copy_asset", "save_asset_bytes"].includes(command)) return { relPath: "./assets/image.png", kind: "image", mime: "image/png" }; });
    mockIPC(calls);
    vi.mocked(open).mockResolvedValue("C:\\image.png");
    const { unmount } = render(<VisualEditor noteId="steps-note" initialInner={initial} onChange={vi.fn()} />);
    const editor = (screen.getByRole("textbox", { name: "Not içeriği" }) as HTMLElement & { editor: Editor }).editor;
    try {
      await act(async () => { fireEvent.click(screen.getByTestId("steps-add-image")); });
      await screen.findByTestId("steps-alt");
      expect(calls).toHaveBeenCalledWith("copy_asset", { noteId: "steps-note", sourcePath: "C:\\image.png" });
      await change(screen.getByTestId("steps-alt"), "Caption"); expect(editor.state.doc.firstChild?.attrs.items[0].image.alt).toBe("Caption");
      await click("Değiştir"); expect(calls.mock.calls.filter(([command]) => command === "copy_asset")).toHaveLength(2);
      await click("Resmi kaldır"); expect(screen.queryByTestId("steps-alt")).toBeNull();
      await act(async () => { fireEvent.paste(descriptions()[0], { clipboardData: { files: [], getData: (type: string) => type === "text/html" ? '<img src="data:image/png;base64,AQID">' : "" } }); });
      await screen.findByTestId("steps-alt");
      expect(calls).toHaveBeenCalledWith("save_asset_bytes", expect.objectContaining({ noteId: "steps-note", bytes: [1, 2, 3] }));
      await click("Resmi kaldır");
      const file = new File([new Uint8Array([4, 5])], "drop.png", { type: "image/png" });
      Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([4, 5]).buffer });
      await act(async () => { fireEvent.drop(descriptions()[0], { dataTransfer: { files: [file] } }); });
      await screen.findByTestId("steps-alt");
      expect(calls).toHaveBeenCalledWith("save_asset_bytes", expect.objectContaining({ bytes: [4, 5] }));
      await click("Resmi kaldır");
      Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => null });
      const point = vi.spyOn(document, "elementFromPoint").mockReturnValue(descriptions()[0]);
      await act(async () => { await getDropHandler("steps-note", "visual")?.(["C:\\native.png"], { x: 20, y: 20 }); });
      point.mockRestore(); await screen.findByTestId("steps-alt");
      expect(calls).toHaveBeenCalledWith("copy_asset", { noteId: "steps-note", sourcePath: "C:\\native.png" });
      await click("Resmi kaldır"); calls.mockClear(); vi.mocked(open).mockResolvedValue("C:\\audio.mp3");
      await act(async () => { fireEvent.click(screen.getByTestId("steps-add-image")); });
      expect(calls).not.toHaveBeenCalled(); expect(screen.queryByTestId("steps-alt")).toBeNull();
      await waitFor(() => expect(headings()).toHaveLength(1));
    } finally { unmount(); vi.mocked(open).mockReset(); }
  });
});
