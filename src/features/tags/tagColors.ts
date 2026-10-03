import type { CSSProperties } from "react";
import { COLOR_NAMES } from "@/lib/colors";
import type { ColorName } from "@/lib/colors";
import { normalizeText } from "@/lib/textMatch";
import { useSettingsStore } from "@/stores/settingsStore";

export function tagColor(colors: Record<string, string> | undefined, tag: string): ColorName | null {
  const color = colors?.[normalizeText(tag)];
  return COLOR_NAMES.includes(color as ColorName) ? color as ColorName : null;
}

export function tagColorStyle(color: ColorName | null): CSSProperties | undefined {
  return color ? { color: `var(--app-color-${color})`, "--tag-color": `var(--app-color-${color})` } as CSSProperties : undefined;
}

export async function setTagColor(tag: string, color: string) {
  const store = useSettingsStore.getState();
  const tagColors = { ...store.settings?.tagColors };
  if (COLOR_NAMES.includes(color as ColorName)) tagColors[normalizeText(tag)] = color;
  else delete tagColors[normalizeText(tag)];
  await store.update({ tagColors });
}

export function reconcileTagColors(colors: Record<string, string>, before: string[], after: string[], existing: string[]): Record<string, string> {
  const next = { ...colors };
  const oldNames = before.map(normalizeText);
  const newNames = after.map(normalizeText);
  const removed = oldNames.filter((name) => !newNames.includes(name));
  const added = newNames.filter((name) => !oldNames.includes(name));
  const used = new Set(existing.map(normalizeText));
  // A replacement of the last occurrence carries its color to the new name.
  if (removed.length === 1 && added.length === 1 && !used.has(removed[0]) && !next[added[0]] && next[removed[0]]) {
    next[added[0]] = next[removed[0]];
  }
  for (const name of removed) if (!used.has(name)) delete next[name];
  return next;
}
