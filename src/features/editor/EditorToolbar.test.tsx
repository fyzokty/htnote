import { Editor } from "@tiptap/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { open } from "@tauri-apps/plugin-dialog";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorToolbar } from "@/features/editor/EditorToolbar";
import { createVisualExtensions } from "@/features/editor/extensions";
import { ipc } from "@/lib/ipc";
import { useUiStore } from "@/stores/uiStore";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

let editor: Editor;
afterEach(() => {
  editor?.destroy();
  vi.mocked(open).mockReset();
  for (const toast of useUiStore.getState().toasts) useUiStore.getState().dismissToast(toast.id);
});

describe("EditorToolbar", () => {
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
    expect(button).toHaveAttribute("title", label as string);
    expect(button.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Medya ekle" })).toBeNull();
    await act(async () => fireEvent.click(button));
    expect(open).toHaveBeenCalledExactlyOnceWith({ multiple: true, filters: [{ name, extensions }] });
    expect(copy).not.toHaveBeenCalled();
    expect(editor.getHTML()).toBe("<p>Text</p>");
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
