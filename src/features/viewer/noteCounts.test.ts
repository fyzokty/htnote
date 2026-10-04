import { describe, expect, it, vi } from "vitest";
import { countNoteText } from "./noteCounts";

describe("countNoteText", () => {
  it("runs in a worker-like environment without DOM APIs", () => {
    vi.stubGlobal("DOMParser", undefined);
    vi.stubGlobal("document", undefined);
    try {
      expect(typeof DOMParser).toBe("undefined");
      expect(typeof document).toBe("undefined");
      expect(countNoteText('<main id="htnote-content"><p>bir &amp; iki</p></main>')).toEqual({ words: 2, characters: 9 });
    } finally { vi.unstubAllGlobals(); }
  });
  it("counts Turkish words, numbers and Unicode code points", () => {
    expect(countNoteText("<p>\u0130stanbul \u0131\u015f\u0131k 42 \u{1f600} !!!</p>")).toEqual({ words: 3, characters: 22 });
  });
  it("inserts boundaries for lists and table cells", () => {
    expect(countNoteText("<ul><li>bir</li><li>iki</li></ul><table><tr><td>3</td><td>d\u00f6rt</td></tr></table>")).toEqual({ words: 4, characters: 14 });
  });
  it("uses only main content, excludes scripts, styles and hidden text", () => {
    expect(countNoteText('<body>Outside<main id="htnote-content"><style>x</style><script>bad()</script><p>Inside</p><p hidden>secret</p></main>Outside</body>')).toEqual({ words: 1, characters: 6 });
  });
  it("preserves repeated spaces and omits only line endings from character counts", () => {
    expect(countNoteText("<pre>a  b\nc\r\nd</pre>")).toEqual({ words: 4, characters: 6 });
  });
  it("handles deeply nested notes without recursive traversal", () => {
    expect(countNoteText("<div>".repeat(4000) + "text" + "</div>".repeat(4000))).toEqual({ words: 1, characters: 4 });
  });
  it("handles empty notes and falls back to body", () => {
    expect(countNoteText("<html><head><title>Title</title></head><body></body></html>")).toEqual({ words: 0, characters: 0 });
    expect(countNoteText("<body><p>A &amp; B</p></body>")).toEqual({ words: 2, characters: 5 });
  });
});
