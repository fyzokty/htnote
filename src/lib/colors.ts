export const COLOR_NAMES = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"] as const;
export type ColorName = typeof COLOR_NAMES[number];

export function colorInputValue(color: string): string {
  if (/^#[\da-f]{6}$/i.test(color)) return color;
  if (/^#[\da-f]{3}$/i.test(color)) return "#" + [...color.slice(1)].map((part) => part + part).join("");
  const rgb = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  return rgb ? "#" + rgb.slice(1).map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0")).join("") : "#000000";
}
