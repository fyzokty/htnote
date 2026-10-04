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
  tagGap?: number;
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
  const width = () => {
    const tags = input.tags.slice(0, visibleTags);
    if (visibleTags < input.tags.length) tags.push(input.overflow);
    if (input.add) tags.push(input.add);
    const tagWidth = tags.reduce((sum, value) => sum + value, 0)
      + Math.max(0, tags.length - 1) * (input.tagGap ?? 4);
    // Count the actual flex groups. A missing breadcrumb/saved/tag group
    // must not consume a separator, especially near the saved-text boundary.
    const groups = [title, path, saved, tagWidth].filter((value) => value > 0).length;
    return title + path + saved + tagWidth + actions
      + Math.max(0, groups - 1) * (input.gap ?? 8)
      + (actions && groups ? input.actionGap ?? 8 : 0);
  };
  if (width() > input.available) saved = 0;
  // A long breadcrumb can yield space without hiding tags that otherwise fit.
  path -= Math.min(Math.max(0, path - 24), Math.max(0, width() - input.available));
  while (visibleTags > 0 && width() > input.available) visibleTags--;

  for (const saving of input.actionSavings ?? []) {
    if (width() <= input.available) break;
    actions -= saving;
    compactLevel++;
  }
  title -= Math.min(title, Math.max(0, width() - input.available));
  return { path, saved, visibleTags, title, compactLevel };
}
