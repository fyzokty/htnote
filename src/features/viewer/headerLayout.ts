export interface HeaderMeasurements {
  available: number;
  title: number;
  path: number;
  saved: number;
  tags: number[];
  add: number;
  overflow: number;
  actions?: number;
  actionSavings?: number[];
  gap?: number;
  actionGap?: number;
}

/** Save metadata, tags and secondary action labels yield before the note title. */
export function fitNoteHeader(input: HeaderMeasurements) {
  let path = input.path;
  let saved = input.saved;
  let visibleTags = input.tags.length;
  let title = input.title;
  let actions = input.actions ?? 0;
  let compactLevel = 0;
  const width = () => title + path + saved + actions
    + ((path ? 1 : 0) + (saved ? 1 : 0) + 1) * (input.gap ?? 8)
    + (actions ? input.actionGap ?? 8 : 0)
    + input.add + input.tags.slice(0, visibleTags).reduce((sum, value) => sum + value + 4, 0)
    + (visibleTags < input.tags.length ? input.overflow + 4 : 0);
  if (width() > input.available) saved = 0;
  // A long breadcrumb can yield space without hiding tags that otherwise fit.
  path -= Math.min(Math.max(0, path - 24), Math.max(0, width() - input.available));
  while (visibleTags > 0 && width() > input.available) visibleTags--;

  for (const savings of input.actionSavings ?? []) {
    if (width() <= input.available) break;
    actions -= savings;
    compactLevel++;
  }
  title -= Math.min(title, Math.max(0, width() - input.available));
  return { path, saved, visibleTags, title, compactLevel };
}
