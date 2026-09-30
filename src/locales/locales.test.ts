import { describe, expect, it } from "vitest";

import en from "@/locales/en.json";
import tr from "@/locales/tr.json";

function keys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof entry === "object" && entry !== null ? [path, ...keys(entry, path)] : [path];
  });
}

describe("locale dictionaries", () => {
  it("have identical translation keys", () => {
    expect(keys(en).sort()).toEqual(keys(tr).sort());
  });
});
