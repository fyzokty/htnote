import { afterEach, describe, expect, it } from "vitest";
import { NOTE_BACKGROUNDS, noteBackgroundStyle, readNoteBackground, writeNoteBackground } from "./noteAppearance";

afterEach(() => { document.documentElement.removeAttribute("style"); });

describe("portable note background", () => {
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
