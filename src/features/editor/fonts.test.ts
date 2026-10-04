import { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { createVisualExtensions } from "./extensions";
import { clampFontSize, familyLabel, fontStack, loadSystemFonts, selectedComputedStyle, selectedTextStyle } from "./fonts";
import { ipc } from "@/lib/ipc";

describe("fonts", () => {
  it("reads the selected text node, heading and inline computed styles", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: '<p style="font-size: 16px; color: rgb(12, 34, 56)">Text</p><h1 style="font-size: 32px">Title</h1><p><span style="font-size: 24px; color: rgb(50, 102, 187)">Span</span></p>' });
    try {
      editor.commands.setTextSelection(1);
      expect(selectedComputedStyle(editor, "fontSize")).toBe("16px");
      expect(selectedComputedStyle(editor, "color")).toBe("rgb(12, 34, 56)");
      editor.commands.setTextSelection(7);
      expect(selectedComputedStyle(editor, "fontSize")).toBe("32px");
      editor.commands.setTextSelection(14);
      expect(selectedComputedStyle(editor, "fontSize")).toBe("24px");
      expect(selectedComputedStyle(editor, "color")).toBe("rgb(50, 102, 187)");
      vi.spyOn(editor.view, "domAtPos").mockImplementation(() => { throw new Error("Unavailable"); });
      expect(selectedComputedStyle(editor, "fontSize")).toBe("");
    } finally { editor.destroy(); }
  });
  it("quotes families safely, chooses portable fallbacks and clamps valid sizes", () => {
    expect(fontStack("Consolas")).toBe('"Consolas", monospace');
    expect(fontStack('A"B\\C')).toBe('"A\\"B\\\\C", sans-serif');
    expect(familyLabel('"Times New Roman", sans-serif')).toBe("Times New Roman");
    expect(clampFontSize("4")).toBe("8px");
    expect(clampFontSize("120")).toBe("96px");
    expect(clampFontSize("24")).toBe("24px");
    expect(clampFontSize("bad")).toBeNull();
    expect(clampFontSize("")).toBeNull();
  });
  it("caches the font request for the session", async () => {
    const list = vi.spyOn(ipc, "listSystemFonts").mockResolvedValue(["Arial"]);
    await expect(loadSystemFonts()).resolves.toEqual(["Arial"]);
    await expect(loadSystemFonts()).resolves.toEqual(["Arial"]);
    expect(list).toHaveBeenCalledTimes(1);
    list.mockRestore();
  });
  it("shows mixed formatting and round-trips all span styles without duplication", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: '<p><span style="color: red; font-family: Arial; font-size: 24px; background: yellow">One</span> two</p>' });
    try {
      editor.commands.setTextSelection({ from: 1, to: 8 });
      expect(selectedTextStyle(editor, "fontFamily")).toBe("—");
      expect(selectedTextStyle(editor, "fontSize")).toBe("—");
      let html = editor.getHTML();
      editor.commands.setContent(html);
      html = editor.getHTML();
      for (const style of ["color:", "font-family:", "font-size:"]) expect(html.split(style)).toHaveLength(2);
      expect(html).toContain("font-size: 24px");
      expect(html).toContain("font-family: Arial");
      expect(html).toContain("background: yellow");
      editor.commands.setTextSelection({ from: 1, to: 4 });
      editor.chain().unsetFontFamily().unsetFontSize().run();
      expect(editor.getHTML()).not.toContain("font-size:");
      expect(editor.getHTML()).not.toContain("font-family:");
      expect(editor.getHTML()).toContain("color:");
    } finally { editor.destroy(); }
  });
});
