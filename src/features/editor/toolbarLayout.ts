/** Grupları sondan gizler; kalan araçların sırasını korur. */
export function fitToolbarGroups(available: number, widths: readonly number[], trigger = 28, gap = 6, priority: readonly number[] = widths.map((_, index) => index).reverse()) {
  const visible = widths.map((_, index) => index);
  const used = () => visible.reduce((sum, index) => sum + widths[index], 0)
    + Math.max(0, visible.length - 1) * gap + (visible.length < widths.length ? trigger + (visible.length ? gap : 0) : 0);
  const order = [...priority, ...visible.filter((index) => !priority.includes(index))];
  for (const index of order) {
    if (used() <= available) break;
    const position = visible.indexOf(index);
    if (position >= 0) visible.splice(position, 1);
  }
  return visible;
}
