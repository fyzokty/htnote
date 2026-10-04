import { describe, expect, it } from "vitest";
import { readWidgetBackground, serializeWidgetBackground, WIDGET_BACKGROUNDS } from "./widgetBackground";

describe("widget backgrounds", () => {
  it("accepts shared presets, omits the default and rejects unknown values", () => {
    expect(readWidgetBackground(undefined)).toBe("");
    expect(serializeWidgetBackground()).toBe("");
    for (const preset of WIDGET_BACKGROUNDS) {
      expect(readWidgetBackground(preset)).toBe(preset);
      expect(serializeWidgetBackground(preset)).toBe(` data-htnote-bg="${preset}"`);
    }
    expect(readWidgetBackground("")).toBeNull();
    expect(readWidgetBackground("unknown")).toBeNull();
  });
});
