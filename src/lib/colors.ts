export const COLOR_NAMES = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"] as const;
export type ColorName = typeof COLOR_NAMES[number];

export interface HSV { h: number; s: number; v: number }
export const validHex = (value: string): boolean => /^#[\da-f]{6}$/i.test(value);
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

export function hexToHsv(hex: string): HSV {
  const rgb = colorInputValue(hex).slice(1).match(/../g)!.map((part) => parseInt(part, 16) / 255);
  const [r, g, b] = rgb;
  const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
  const hue = !delta ? 0 : max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: (hue * 60 + 360) % 360, s: max ? delta / max * 100 : 0, v: max * 100 };
}

export function hsvToHex({ h, s, v }: HSV): string {
  const hue = ((h % 360) + 360) % 360 / 60;
  const saturation = clamp(s, 100) / 100, brightness = clamp(v, 100) / 100;
  const c = brightness * saturation, x = c * (1 - Math.abs(hue % 2 - 1)), m = brightness - c;
  const rgb = hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x];
  return "#" + rgb.map((part) => Math.round((part + m) * 255).toString(16).padStart(2, "0")).join("");
}

const RECENT_KEY = "htnote.custom-colors";
export function readRecentColors(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string" && validHex(value)).slice(0, 6) : [];
  } catch { return []; }
}
export function rememberColor(color: string): void {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([color, ...readRecentColors().filter((value) => value !== color)].slice(0, 6))); } catch { /* Depolama kapalıysa renk yine uygulanır. */ }
}

function normalizedColor(color: string): string | null {
  color = color.trim();
  if (/^#[\da-f]{6}$/i.test(color)) return color;
  if (/^#[\da-f]{3}$/i.test(color)) return "#" + [...color.slice(1)].map((part) => part + part).join("");
  const rgb = color.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i);
  return rgb ? "#" + rgb.slice(1).map((part) => Math.round(Math.min(255, Number(part))).toString(16).padStart(2, "0")).join("") : null;
}

export function colorInputValue(color: string): string {
  return normalizedColor(color) ?? "#000000";
}

export function resolveCustomColor(value: string, computedColor: string, accentColor: string): string {
  // Palet kaydındaki hex yedeği, temaya bağlı değişkenin önüne geçer.
  const paletteHex = value.trim().match(/^var\(\s*--ht-color-[\w-]+\s*,\s*(#[\da-f]{6}|#[\da-f]{3})\s*\)$/i)?.[1];
  return normalizedColor(paletteHex ?? value) ?? normalizedColor(computedColor) ?? normalizedColor(accentColor) ?? "#000000";
}
