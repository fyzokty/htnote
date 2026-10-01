import { Compartment } from "@codemirror/state";
import { undoDepth } from "@codemirror/commands";
import { describe, expect, it } from "vitest";

import { codeChange, createCodeState } from "@/features/editor/codeState";

describe("codeState", () => {
  it("sekme durumları arasında içerik, seçim ve geri alma geçmişi korunur", () => {
    const theme = new Compartment();
    const html = createCodeState("html", "<p>ilk</p>", theme, "light");
    const css = createCodeState("css", "p {}", theme, "light");
    const changed = html.update({ changes: { from: 3, insert: "yeni " }, selection: { anchor: 8 }, userEvent: "input.type" }).state;
    const states = { html: changed, css };
    expect(states.css.doc.toString()).toBe("p {}");
    expect(states.html.doc.toString()).toBe("<p>yeni ilk</p>");
    expect(states.html.selection.main.anchor).toBe(8);
    expect(undoDepth(states.html)).toBe(1);
    expect(undoDepth(states.css)).toBe(0);
  });

  it("yalnızca değişen sekme için kısmi güncelleme üretir", () => {
    expect(codeChange("css", "body {}" )).toEqual({ css: "body {}" });
  });
});
