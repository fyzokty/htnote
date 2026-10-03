import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLOR_NAMES } from "./colors";

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
