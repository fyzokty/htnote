import { describe, expect, it } from "vitest";

import { normalizeText, textMatch } from "@/lib/textMatch";

describe("textMatch", () => {
  it("folds Turkish letters and accents", () => {
    expect(textMatch("İstanbul", "istanbul")).toBe(true);
    expect(textMatch("ılık", "ILIK")).toBe(true);
    expect(textMatch("École", "ecole")).toBe(true);
    expect(normalizeText("Iİıi")).toBe("iiii");
  });

  it("matches substrings and empty queries", () => {
    expect(textMatch("Merhaba Dünya", "haba")).toBe(true);
    expect(textMatch("Merhaba", " ")).toBe(true);
    expect(textMatch("Merhaba", "xyz")).toBe(false);
  });
});
