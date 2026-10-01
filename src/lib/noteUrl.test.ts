import { describe, expect, it } from "vitest";

import { getNoteOrigin, initNoteOrigin, noteUrl } from "@/lib/noteUrl";

describe("noteUrl", () => {
  it("uses the initialized loopback origin", () => {
    initNoteOrigin("http://127.0.0.1:54321");
    expect(getNoteOrigin()).toBe("http://127.0.0.1:54321");
    expect(noteUrl("id")).toBe("http://127.0.0.1:54321/id/");
    expect(noteUrl("id", "assets/a b.png")).toBe("http://127.0.0.1:54321/id/assets/a%20b.png");
  });

  it("rejects non-loopback origins", () => {
    expect(() => initNoteOrigin("http://evil.example:1234")).toThrow();
  });
});
