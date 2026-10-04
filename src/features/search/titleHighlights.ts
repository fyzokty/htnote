import { normalizeText } from "@/lib/textMatch";

/** Map normalized matches back to the original title, including combining accents. */
export function titleHighlights(title: string, query: string): { text: string; match: boolean }[] {
  const needle = normalizeText(query.trim());
  if (!needle) return [{ text: title, match: false }];
  let normalized = "";
  const offsets: { start: number; end: number }[] = [];
  for (const segment of title.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const value = normalizeText(segment[0]);
    normalized += value;
    for (let index = 0; index < value.length; index++) offsets.push({ start: segment.index, end: segment.index + segment[0].length });
  }
  const parts: { text: string; match: boolean }[] = [];
  let cursor = 0;
  let searchFrom = 0;
  let index: number;
  while ((index = normalized.indexOf(needle, searchFrom)) !== -1) {
    const start = offsets[index].start;
    const end = offsets[index + needle.length - 1].end;
    if (start > cursor) parts.push({ text: title.slice(cursor, start), match: false });
    if (end > cursor) parts.push({ text: title.slice(Math.max(cursor, start), end), match: true });
    cursor = end;
    searchFrom = index + needle.length;
  }
  if (cursor < title.length) parts.push({ text: title.slice(cursor), match: false });
  return parts;
}
