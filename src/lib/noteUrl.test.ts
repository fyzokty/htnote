import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("noteUrl", () => {
  it.each([
    ["windows", "http://htnote-note.localhost"],
    ["mac", "htnote-note://localhost"],
    ["linux", "htnote-note://localhost"],
  ])("%s origin seçer", async (platform, origin) => {
    vi.doMock("@/lib/shortcuts/registry", () => ({ getPlatform: () => platform }));
    const { NOTE_ORIGIN, noteUrl } = await import("@/lib/noteUrl");
    expect(NOTE_ORIGIN).toBe(origin);
    expect(noteUrl("id")).toBe(`${origin}/id/`);
    expect(noteUrl("id", "assets/a b.png")).toBe(`${origin}/id/assets/a%20b.png`);
  });

  it("Android için HTTP origin seçer", async () => {
    vi.stubGlobal("navigator", { userAgent: "Android", platform: "Linux" });
    vi.doMock("@/lib/shortcuts/registry", () => ({ getPlatform: () => "linux" }));
    const { NOTE_ORIGIN } = await import("@/lib/noteUrl");
    expect(NOTE_ORIGIN).toBe("http://htnote-note.localhost");
  });
});
