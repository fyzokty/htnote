import { describe, expect, it, vi } from "vitest";

import { resolveLanguage, writeCachedLanguage } from "@/i18n/language";

describe("writeCachedLanguage", () => {
  it.each(["tr", "en"] as const)("caches %s", (language) => {
    writeCachedLanguage(language);
    expect(localStorage.getItem("htnote.language")).toBe(language);
    localStorage.removeItem("htnote.language");
  });
  it("tolerates unavailable storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => writeCachedLanguage("en")).not.toThrow();
  });
});

describe("resolveLanguage", () => {
  it.each([
    [null, "tr-TR", "tr"],
    [null, "tr", "tr"],
    [null, "de-DE", "en"],
    [null, "en-US", "en"],
    ["en", "tr-TR", "en"],
  ] as const)("resolves %s and %s to %s", (setting, browser, expected) => {
    expect(resolveLanguage(setting, browser)).toBe(expected);
  });
});
