/** Human-readable Windows paths only; keep the original value for filesystem/IPC calls. */
export function displayPath(path: string): string {
  if (path.startsWith("\\\\?\\UNC\\")) return `\\\\${path.slice(8)}`;
  if (/^\\\\\?\\[a-z]:\\/i.test(path)) return path.slice(4);
  return path;
}
