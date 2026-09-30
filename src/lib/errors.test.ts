import { describe, expect, it } from "vitest";

import { isAppError } from "@/lib/errors";

describe("isAppError", () => {
  it("bilinen kodlu hata nesnesini kabul eder", () => {
    expect(isAppError({ code: "NOTE_NOT_FOUND", message: "missing" })).toBe(true);
  });

  it("geçersiz değerleri reddeder", () => {
    expect(isAppError(null)).toBe(false);
    expect(isAppError("NOTE_NOT_FOUND")).toBe(false);
    expect(isAppError({ code: "NOTE_NOT_FOUND" })).toBe(false);
    expect(isAppError({ code: "UNKNOWN", message: "missing" })).toBe(false);
  });
});
