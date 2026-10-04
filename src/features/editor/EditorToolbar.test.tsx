import { Editor } from "@tiptap/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { open } from "@tauri-apps/plugin-dialog";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorToolbar } from "@/features/editor/EditorToolbar";
import { createVisualExtensions } from "@/features/editor/extensions";
import { ipc } from "@/lib/ipc";
import { useUiStore } from "@/stores/uiStore";
import { formatShortcut } from "@/lib/shortcuts/registry";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

let editor: Editor;
afterEach(() => {
  editor?.destroy();
  vi.useRealTimers();
  vi.mocked(open).mockReset();
  for (const toast of useUiStore.getState().toasts) useUiStore.getState().dismissToast(toast.id);
});

describe("EditorToolbar", () => {
  it("moves overflowing groups to keyboard-accessible tools and restores them on resize", () => {
    let width = 400;
    const widths = [132, 141, 141, 209, 107, 177, 73];
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    let resize: (() => void) | undefined;
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { left: 0, right: 100, top: 0, bottom: 32, height: 32, width: this.classList.contains("htnote-toolbar-groups") ? width : this.hasAttribute("data-toolbar-group") ? widths[Number(this.dataset.toolbarGroup)] : 0 } as DOMRect;
    });
    try {
      editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>Text</p>" });
      render(<EditorToolbar editor={editor} />);
      const trigger = screen.getByTestId("editor-overflow");
      expect(screen.queryByRole("button", { name: "Madde listesi" })).toBeNull();
      fireEvent.click(trigger);
      const panel = screen.getByRole("dialog", { name: "Diğer biçimlendirme araçları" });
      const list = within(panel).getByRole("button", { name: "Madde listesi" });
      expect(list).toHaveFocus();
      fireEvent.click(list);
      expect(editor.getHTML()).toContain("<ul>");
      expect(list).toHaveAttribute("aria-pressed", "true");
      fireEvent.keyDown(list, { key: "ArrowRight" });
      expect(within(panel).getByRole("button", { name: "Numaralı liste" })).toHaveFocus();
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(trigger).toHaveFocus();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      width = 1138;
      act(() => resize?.());
      expect(screen.queryByTestId("editor-overflow")).toBeNull();
      expect(screen.getByRole("button", { name: "Madde listesi" })).toHaveAttribute("aria-pressed", "true");
    } finally { vi.unstubAllGlobals(); vi.restoreAllMocks(); }
  });
  it("applies custom text color to the preserved selection and resets it", async () => {
    editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>Text</p>" });
    editor.commands.setTextSelection({ from: 1, to: 5 });
    render(<EditorToolbar editor={editor} />);
    fireEvent.click(screen.getByRole("button", { name: "Yazı rengi" }));
    await act(async () => fireEvent.change(screen.getByLabelText("Özel renk"), { target: { value: "#123456" } }));
    expect(editor.getHTML()).toContain('style="color: rgb(18, 52, 86);"');
    fireEvent.click(screen.getByRole("button", { name: "Yazı rengi" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Varsayılan (renk yok)" })));
    expect(editor.getHTML()).not.toContain("color:");
  });

  it.each([
    ["Görsel ekle", "Görseller", ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"]],
    ["Ses ekle", "Ses dosyaları", ["mp3", "wav", "ogg", "m4a"]],
    ["Video ekle", "Videolar", ["mp4", "webm"]],
  ])("opens only the %s filter with multiple selection", async (label, name, extensions) => {
    editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>Text</p>" });
    vi.mocked(open).mockResolvedValue(null);
    const copy = vi.spyOn(ipc, "copyAsset");
    render(<EditorToolbar editor={editor} noteId="note" />);
    const button = screen.getByRole("button", { name: label as string });
    expect(button).not.toHaveAttribute("title");
    expect(button.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Medya ekle" })).toBeNull();
    await act(async () => fireEvent.click(button));
    expect(open).toHaveBeenCalledExactlyOnceWith({ multiple: true, filters: [{ name, extensions }] });
    expect(copy).not.toHaveBeenCalled();
    expect(editor.getHTML()).toBe("<p>Text</p>");
  });

  it("shows every action tooltip when hovering its SVG icon, including disabled actions", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 28, height: 28, left: 0, top: 0, bottom: 28 } as DOMRect);
    editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>Text</p>" });
    render(<EditorToolbar editor={editor} onLinkNote={vi.fn()} />);
    const toolbar = screen.getByRole("toolbar");
    expect(within(toolbar).getByRole("group", { name: "Geçmiş" })).toContainElement(screen.getByRole("button", { name: "Geri al" }));
    expect(within(toolbar).getByRole("group", { name: "Metin biçimi" })).toContainElement(screen.getByRole("button", { name: "Kalın" }));
    vi.useFakeTimers();
    for (const button of within(toolbar).getAllByRole("button")) {
      const icon = button.querySelector("svg")!;
      expect(icon).not.toBeNull();
      fireEvent.mouseEnter(icon);
      act(() => vi.advanceTimersByTime(400));
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveTextContent(button.getAttribute("aria-label")!);
      expect(button).toHaveAttribute("aria-describedby", tooltip.id);
      if (button.getAttribute("aria-label") === "Kalın") expect(tooltip).toHaveTextContent(formatShortcut("editorBold"));
      if (button.getAttribute("aria-label") === "İtalik") expect(tooltip).toHaveTextContent(formatShortcut("editorItalic"));
      if (button.getAttribute("aria-label") === "Altı çizili") expect(tooltip).toHaveTextContent(formatShortcut("editorUnderline"));
      if (button.getAttribute("aria-label") === "Geri al") expect(tooltip).toHaveTextContent("Ctrl+Z");
      if (button.getAttribute("aria-label") === "Yinele") expect(tooltip).toHaveTextContent("Ctrl+Shift+Z");
      fireEvent.mouseLeave(icon);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    }
  });

  it("keeps undo and redo availability in sync with formatting transactions", () => {
    editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>Text</p>" });
    render(<EditorToolbar editor={editor} />);
    const undo = screen.getByRole("button", { name: "Geri al" });
    const redo = screen.getByRole("button", { name: "Yinele" });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "h2" } });
    expect(undo).toBeEnabled();
    fireEvent.click(undo);
    expect(editor.getHTML()).toBe("<p>Text</p>");
    expect(redo).toBeEnabled();
    fireEvent.click(redo);
    expect(editor.getHTML()).toBe("<h2>Text</h2>");
    fireEvent.click(screen.getByRole("button", { name: "Kalın" }));
    expect(screen.getByRole("button", { name: "Kalın" })).toHaveAttribute("aria-pressed", "true");
  });

  it("inserts every selected image in order at the captured cursor", async () => {
    editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>BeforeAfter</p>" });
    editor.commands.setTextSelection(7);
    vi.mocked(open).mockResolvedValue(["C:\\first.png", "C:\\second.png", "C:\\third.png"]);
    const copy = vi.spyOn(ipc, "copyAsset").mockImplementation(async (_noteId, path) => {
      editor.commands.setTextSelection(1);
      return { relPath: `./assets/${path.split("\\").pop()}`, kind: "image", mime: "image/png" };
    });
    render(<EditorToolbar editor={editor} noteId="note" />);
    fireEvent.click(screen.getByRole("button", { name: "Görsel ekle" }));
    await waitFor(() => expect(editor.getHTML()).toBe('<p>Before</p><img src="./assets/first.png"><img src="./assets/second.png"><img src="./assets/third.png"><p>After</p>'));
    expect(copy.mock.calls).toEqual([["note", "C:\\first.png"], ["note", "C:\\second.png"], ["note", "C:\\third.png"]]);
    act(() => { editor.commands.undo(); });
    expect(editor.getHTML()).toBe("<p>BeforeAfter</p>");
  });

  it("keeps successful audio files in order when a copy fails", async () => {
    editor = new Editor({ extensions: createVisualExtensions("") });
    vi.mocked(open).mockResolvedValue(["first.mp3", "bad.wav", "last.ogg"]);
    vi.spyOn(ipc, "copyAsset").mockImplementation(async (_noteId, path) => {
      if (path === "bad.wav") throw new Error("copy failed");
      return { relPath: `./assets/${path}`, kind: "audio", mime: "audio/mpeg" };
    });
    render(<EditorToolbar editor={editor} noteId="note" />);
    fireEvent.click(screen.getByRole("button", { name: "Ses ekle" }));
    await waitFor(() => expect(editor.getJSON().content?.map((node) => node.attrs?.src)).toEqual(["./assets/first.mp3", "./assets/last.ogg"]));
    expect(useUiStore.getState().toasts).toEqual([expect.objectContaining({ messageKey: "editor.dropCopyFailed", params: { name: "bad.wav" } })]);
  });

  it("runs formatting commands and reflects the active block", () => {
    editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>Text</p>" });
    render(<EditorToolbar editor={editor} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "h2" } });
    expect(editor.getHTML()).toContain("<h2>Text</h2>");
    expect(screen.getByRole("combobox")).toHaveValue("h2");
    fireEvent.click(screen.getByRole("button", { name: "Madde listesi" }));
    expect(editor.getHTML()).toContain("<ul>");
    expect(screen.getByRole("button", { name: "Madde listesi" })).toHaveAttribute("aria-pressed", "true");
  });

  it("rejects javascript links", () => {
    editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>Text</p>" });
    render(<EditorToolbar editor={editor} />);
    fireEvent.click(screen.getByRole("button", { name: "Bağlantı ekle" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Bağlantı adresi" }), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Uygula" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(editor.getHTML()).not.toContain("javascript:");
  });

  it("inserts a headed 3 by 3 table and changes its rows and columns", () => {
    editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>Text</p>" });
    render(<EditorToolbar editor={editor} />);
    fireEvent.click(screen.getByRole("button", { name: "Tablo ekle" }));
    expect(editor.getHTML().match(/<tr>/g)).toHaveLength(3);
    expect(editor.getHTML().match(/<th/g)).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Satır ekle" }));
    expect(editor.getHTML().match(/<tr>/g)).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Sütun ekle" }));
    expect(editor.getHTML().match(/<(td|th)/g)).toHaveLength(16);
    fireEvent.click(screen.getByRole("button", { name: "Sütunu sil" }));
    expect(editor.getHTML().match(/<(td|th)/g)).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Satırı sil" }));
    expect(editor.getHTML().match(/<tr>/g)).toHaveLength(3);
  });
});
