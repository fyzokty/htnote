import { Compartment } from "@codemirror/state";
import { undoDepth } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { codeChange, codeTheme, createCodeState } from "@/features/editor/codeState";

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

  it("her sekmenin temasını kendi durumunda yeniden yapılandırır", () => {
    const htmlTheme = new Compartment();
    const cssTheme = new Compartment();
    const html = createCodeState("html", "<p>ilk</p>", htmlTheme, "light");
    const css = createCodeState("css", "p {}", cssTheme, "light");

    const darkHtml = html.update({ effects: htmlTheme.reconfigure(codeTheme("dark")) }).state;
    expect(darkHtml.facet(EditorView.darkTheme)).toBe(true);
    expect(css.facet(EditorView.darkTheme)).toBe(false);

    const darkCss = css.update({ effects: cssTheme.reconfigure(codeTheme("dark")) }).state;
    expect(darkHtml.facet(EditorView.darkTheme)).toBe(true);
    expect(darkCss.facet(EditorView.darkTheme)).toBe(true);
  });
});
