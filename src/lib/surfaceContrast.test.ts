import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const css = readFileSync("src/index.css", "utf8");
function luminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}
it.each(["light", "dark"])("keeps %s primary buttons, accent text and highlights at WCAG AA", (mode) => {
  const block = mode === "light" ? css.split(":root.dark")[0] : css.split(":root.dark")[1].split("@theme")[0];
  const token = (name: string) => block.match(new RegExp(`--app-${name}: (#[\\da-f]{6})`))![1];
  for (const state of ["primary", "primary-hover", "primary-active"]) expect(contrast(token(state), token("accent-text")), state).toBeGreaterThanOrEqual(4.5);
  for (const surface of ["card", "selected", "hover"]) expect(contrast(token("accent"), token(surface)), surface).toBeGreaterThanOrEqual(4.5);
  expect(contrast(token("highlight"), token("highlight-text"))).toBeGreaterThanOrEqual(4.5);
});
