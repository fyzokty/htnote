import { describe, expect, it } from "vitest";

import { resolveLanguage } from "@/i18n/language";

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
