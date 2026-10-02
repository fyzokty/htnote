import { describe, expect, it } from "vitest";

import { exportFileName, shouldExport } from "@/features/viewer/exportNote";

describe("exportFileName", () => {
  it("preserves Turkish characters", () => {
    expect(exportFileName("İş görüşmesi", "pdf")).toBe("İş görüşmesi.pdf");
  });

  it("replaces illegal characters and guards reserved names", () => {
    expect(exportFileName(" A/B:*? ", "html")).toBe("A-B---.html");
    expect(exportFileName("CON", "zip")).toBe("CON_.zip");
  });

  it("uses a fallback for an empty title", () => {
    expect(exportFileName(" ... ", "zip")).toBe("Adsız Not.zip");
  });
});

describe("shouldExport", () => {
  it("continues for a clean note or an explicit export choice", () => {
    expect(shouldExport(false, "cancel", false)).toBe(true);
    expect(shouldExport(true, "discard", false)).toBe(true);
    expect(shouldExport(true, "save", true)).toBe(true);
  });

  it("stops after cancel or failed save", () => {
    expect(shouldExport(true, "cancel", false)).toBe(false);
    expect(shouldExport(true, "save", false)).toBe(false);
  });
});
