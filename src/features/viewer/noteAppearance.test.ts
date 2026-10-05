import { afterEach, describe, expect, it } from "vitest";
import { NOTE_BACKGROUNDS, noteBackgroundStyle, readNoteBackground, writeNoteBackground, syncAppearanceStyle } from "./noteAppearance";
import { serializeCopyFields } from "@/features/editor/copyFields";
import { serializeTextBox } from "@/features/editor/textBox";

afterEach(() => { document.documentElement.removeAttribute("style"); });

describe("portable note background", () => {
  it("keeps copyfields export styling without a preset and removes it after the last widget is deleted", () => {
    const widget = serializeCopyFields({ title: "Fields", fields: [{ label: "Host", value: "<&>" }], html: null });
    const html = `<html><head></head><body><main id="htnote-content">${widget}</main></body></html>`;
    const saved = syncAppearanceStyle(html);
    expect(saved).toContain(widget);
    expect(new DOMParser().parseFromString(saved, "text/html").getElementById("htnote-appearance")).not.toBeNull();
    expect(syncAppearanceStyle(saved)).toBe(saved);
    expect(syncAppearanceStyle(saved.replace(widget, ""))).toBe(html.replace(widget, ""));
  });
  it("embeds widget presets without a body preset and keeps the stylesheet until the last preset is removed", () => {
    for (const preset of NOTE_BACKGROUNDS) for (const mode of ["light", "dark"]) {
      document.documentElement.style.setProperty(`--app-note-${preset}-${mode}`, mode === "light" ? "#abcdef" : "#123456");
    }
    const box = serializeTextBox({ title: "Title", content: "Content", html: null, background: "mint" });
    const html = `<html><head></head><body><main id="htnote-content">${box}</main></body></html>`;
    const saved = syncAppearanceStyle(html);
    const doc = new DOMParser().parseFromString(saved, "text/html");
    expect(doc.body.hasAttribute("data-ht-bg")).toBe(false);
    const css = doc.getElementById("htnote-appearance")!.textContent!;
    for (const preset of NOTE_BACKGROUNDS) {
      expect(css).toContain(`--ht-note-${preset}:`);
      expect(css).toContain(`[data-htnote-widget][data-htnote-bg="${preset}"]`);
    }
    expect(saved).toContain(box);
    expect(syncAppearanceStyle(saved)).toBe(saved);
    expect(writeNoteBackground(writeNoteBackground(saved, "rose"), "")).toContain('id="htnote-appearance"');
    const reset = syncAppearanceStyle(saved.replace(' data-htnote-bg="mint"', ""));
    expect(reset).not.toContain("htnote-appearance");
    expect(syncAppearanceStyle(html.replace(' data-htnote-bg="mint"', ""))).toBe(html.replace(' data-htnote-bg="mint"', ""));
  });
  it("writes presets without changing the content, author CSS or scripts", () => {
    document.documentElement.style.setProperty("--app-note-sepia-light", "#faf3e5");
    document.documentElement.style.setProperty("--app-note-sepia-dark", "#302b23");
    document.documentElement.style.setProperty("--app-text-light", "#111827");
    document.documentElement.style.setProperty("--app-text-dark", "#f1f5f9");
    const content = '<main id="htnote-content"><p style="color: red">Türkçe</p><script>run()</script></main>';
    const html = `<!DOCTYPE html><html><head><style>body {background: red}</style></head><body class='author'>${content}</body></html>`;
    const saved = writeNoteBackground(html, "sepia");
    expect(saved).toContain(content);
    expect(saved).toContain("<style>body {background: red}</style>");
    expect(readNoteBackground(saved)).toBe("sepia");
    expect(saved).toContain("--ht-note-sepia:#faf3e5");
    expect(saved).toContain("--ht-note-sepia:#302b23");
    expect(saved).toContain("prefers-color-scheme:dark");
    expect(saved).toContain('--ht-text:#f1f5f9');
    const changed = writeNoteBackground(saved, "mint");
    expect(changed.match(/id="htnote-appearance"/g)).toHaveLength(1);
    expect(changed.match(/data-ht-bg=/g)).toHaveLength(NOTE_BACKGROUNDS.length * 2 + 1);
    expect(readNoteBackground(changed)).toBe("mint");
    const reset = writeNoteBackground(changed, "");
    expect(readNoteBackground(reset)).toBe("");
    expect(reset).not.toContain("htnote-appearance");
    expect(reset).toContain(content);
  });

  it("uses theme tokens on the editor surface and rejects unsafe presets", () => {
    expect(noteBackgroundStyle('<body data-ht-bg="rose"></body>')).toEqual({ background: "var(--app-note-rose)", color: "var(--app-text)" });
    expect(noteBackgroundStyle("<body></body>").background).toBe("var(--app-surface)");
    expect(() => writeNoteBackground('<body></body>', '"><script>')).toThrow();
    expect(() => writeNoteBackground('<main>x</main>', 'rose')).toThrow();
  });
});
