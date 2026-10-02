import { describe, expect, it } from "vitest";

import { resolveMediaSrc } from "@/features/editor/mediaSrc";
import { initNoteOrigin } from "@/lib/noteUrl";

describe("resolveMediaSrc", () => {
  it("resolves relative paths against the note URL", () => {
    initNoteOrigin("http://127.0.0.1:4123");
    expect(resolveMediaSrc("note-id", "./assets/a b.png")).toBe("http://127.0.0.1:4123/note-id/assets/a%20b.png");
    expect(resolveMediaSrc("note-id", "assets/a.png")).toBe("http://127.0.0.1:4123/note-id/assets/a.png");
  });

  it("preserves URL escaping, query strings and fragments", () => {
    initNoteOrigin("http://127.0.0.1:4123");
    expect(resolveMediaSrc("note-id", "./assets/a%20b.png?v=1#preview")).toBe("http://127.0.0.1:4123/note-id/assets/a%20b.png?v=1#preview");
    expect(resolveMediaSrc("note-id", "./assets/şarkı.wav")).toBe("http://127.0.0.1:4123/note-id/assets/%C5%9Fark%C4%B1.wav");
    expect(resolveMediaSrc("note-id", "./assets/nested/../a.png")).toBe("http://127.0.0.1:4123/note-id/assets/a.png");
  });

  it("resolves root and protocol relative URLs against the note origin", () => {
    initNoteOrigin("http://127.0.0.1:4123");
    expect(resolveMediaSrc("note-id", "/note-id/assets/a.png")).toBe("http://127.0.0.1:4123/note-id/assets/a.png");
    expect(resolveMediaSrc("note-id", "//example.com/a.png")).toBe("http://example.com/a.png");
  });

  it("keeps empty sources and sources without a note id", () => {
    expect(resolveMediaSrc("note-id", "")).toBe("");
    expect(resolveMediaSrc("", "./assets/a.png")).toBe("./assets/a.png");
  });

  it("does not crash the editor on a malformed URL", () => {
    initNoteOrigin("http://127.0.0.1:4123");
    expect(resolveMediaSrc("note-id", "//invalid host/a.png")).toBe("//invalid host/a.png");
  });

  it.each(["https://example.com/a.png", "data:image/png;base64,AA", "blob:abc"])(
    "keeps absolute URL %s",
    (src) => expect(resolveMediaSrc("note-id", src)).toBe(src),
  );
});
