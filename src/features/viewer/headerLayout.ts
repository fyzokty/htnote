export interface HeaderMeasurements {
  available: number;
  title: number;
  path: number;
  saved: number;
  tags: number[];
  add: number;
  overflow: number;
}

/** Preserve full content first, then shorten path, saved time, and finally fold tags. */
export function fitNoteHeader(input: HeaderMeasurements) {
  let path = input.path;
  let saved = input.saved;
  let visibleTags = input.tags.length;
  const width = () => input.title + path + saved
    + ((path ? 1 : 0) + (saved ? 1 : 0) + 1) * 8
    + input.add + input.tags.slice(0, visibleTags).reduce((sum, value) => sum + value + 4, 0)
    + (visibleTags < input.tags.length ? input.overflow + 4 : 0);
  path -= Math.min(Math.max(0, path - 24), Math.max(0, width() - input.available));
  saved -= Math.min(Math.max(0, saved - 36), Math.max(0, width() - input.available));
  while (visibleTags > 0 && width() > input.available) visibleTags--;
  return { path, saved, visibleTags };
}
