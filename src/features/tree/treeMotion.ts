export function animatedFolderChange(previous: ReadonlySet<string>, current: ReadonlySet<string>, filtering: boolean, treeChanged: boolean): string | null {
  if (filtering || treeChanged) return null;
  const changed = [...new Set([...previous, ...current])].filter((path) => previous.has(path) !== current.has(path));
  return changed.length === 1 ? changed[0] : null;
}
