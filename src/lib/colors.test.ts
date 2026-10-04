import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLOR_NAMES, hexToHsv, hsvToHex, readRecentColors, rememberColor, resolveCustomColor } from "./colors";

describe("custom color initial value", () => {
  it.each([
    ["", "rgb(50, 102, 187)", "#abcdef", "#3266bb"],
    ["var(--app-text)", "rgb(255 128 0)", "#abcdef", "#ff8000"],
    ["var(--ht-color-red, #c12345)", "rgb(1, 2, 3)", "#abcdef", "#c12345"],
    ["var(--ht-color-blue, #abc)", "", "#123456", "#aabbcc"],
    ["#000000", "rgb(255, 255, 255)", "#abcdef", "#000000"],
    ["#123456", "rgb(255, 255, 255)", "#abcdef", "#123456"],
    ["", "", " #abc ", "#aabbcc"],
    ["var(--unknown)", "invalid", "rgb(12, 34, 56)", "#0c2238"],
    ["", "rgba(12, 34, 56, 1)", "#abcdef", "#0c2238"],
  ])("resolves %s using computed text and accent fallbacks", (value, computed, accent, expected) => {
    expect(resolveCustomColor(value, computed, accent)).toBe(expected);
  });
});

const css = readFileSync("src/index.css", "utf8");
type RGB = [number, number, number];
const rgb = (hex: string): RGB => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as RGB;
function luminance(color: RGB) {
  const linear = color.map((channel) => channel / 255 <= 0.04045 ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

describe("tag palette contrast", () => {
  it.each(["light", "dark"])("keeps all %s tag colors readable on normal and hovered chips", (mode) => {
    const block = mode === "light" ? css.split(":root.dark")[0] : css.split(":root.dark")[1].split("@theme")[0];
    const surface = rgb(css.match(new RegExp(`--app-surface-${mode}: (#[\\da-f]{6})`))![1]);
    for (const name of COLOR_NAMES) {
      const color = rgb(block.match(new RegExp(`--app-color-${name}: (#[\\da-f]{6})`))![1]);
      for (const opacity of [0.14, 0.18]) {
        const background = color.map((channel, index) => channel * opacity + surface[index] * (1 - opacity)) as RGB;
        const [low, high] = [luminance(color), luminance(background)].sort((a, b) => a - b);
        expect((high + 0.05) / (low + 0.05), `${mode} ${name} ${opacity}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("color conversions", () => {
  it.each(["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#123456", "#3266bb", "#888888"])("round-trips %s", (hex) => {
    expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  });
  it("normalizes hue and bounds saturation and brightness", () => {
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 100, v: 100 });
    expect(hsvToHex({ h: 480, s: 200, v: 100 })).toBe("#00ff00");
    expect(hsvToHex({ h: -120, s: 100, v: 100 })).toBe("#0000ff");
    expect(hsvToHex({ h: 20, s: 50, v: -1 })).toBe("#000000");
  });
  it("keeps six recent unique valid colors and tolerates invalid storage", () => {
    localStorage.setItem("htnote.custom-colors", "bad");
    expect(readRecentColors()).toEqual([]);
    for (let i = 0; i < 8; i++) rememberColor(`#00000${i}`);
    rememberColor("#000007");
    expect(readRecentColors()).toEqual(["#000007", "#000006", "#000005", "#000004", "#000003", "#000002"]);
  });
});
