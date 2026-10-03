export function formatAudioTime(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function audioFileName(src: string): string {
  const name = src.split(/[?#]/)[0].split("/").pop() || "";
  if (/^(data:|blob:)/.test(src)) return "";
  try { return decodeURIComponent(name); } catch { return name; }
}

export function audioBarHeights(name: string): number[] {
  let seed = 0;
  for (const char of name) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  return Array.from({ length: 40 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return 25 + seed % 76;
  });
}
