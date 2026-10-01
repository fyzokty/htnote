import { Editor } from "@tiptap/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EditorToolbar } from "@/features/editor/EditorToolbar";
import { createVisualExtensions } from "@/features/editor/extensions";

let editor: Editor;
afterEach(() => editor?.destroy());

describe("EditorToolbar", () => {
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
