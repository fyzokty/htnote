import { describe, expect, it } from "vitest";

import { resolveMediaSrc } from "@/features/editor/mediaSrc";
import { initNoteOrigin } from "@/lib/noteUrl";

describe("resolveMediaSrc", () => {
  it("resolves relative paths against the note URL", () => {
    initNoteOrigin("http://127.0.0.1:4123");
    expect(resolveMediaSrc("note-id", "./assets/a b.png")).toBe("http://127.0.0.1:4123/note-id/assets/a%20b.png");
    expect(resolveMediaSrc("note-id", "assets/a.png")).toBe("http://127.0.0.1:4123/note-id/assets/a.png");
  });

  it.each(["https://example.com/a.png", "data:image/png;base64,AA", "blob:abc", "//example.com/a.png", "/assets/a.png"])(
    "keeps absolute URL %s",
    (src) => expect(resolveMediaSrc("note-id", src)).toBe(src),
  );
});
