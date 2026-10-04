export function animatedFolderChange(previous: ReadonlySet<string>, current: ReadonlySet<string>, filtering: boolean, treeChanged: boolean): string | null {
  if (filtering || treeChanged) return null;
  const changed = [...new Set([...previous, ...current])].filter((path) => previous.has(path) !== current.has(path));
  return changed.length === 1 ? changed[0] : null;
}

export function animateBulkCollapse(previous: ReadonlySet<string>, current: ReadonlySet<string>, requested: boolean, treeChanged: boolean): boolean {
  return requested && !treeChanged && previous.size > 0 && current.size === 0;
}
