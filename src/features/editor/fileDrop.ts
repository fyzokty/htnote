import type { AssetInfo, AssetKind } from "@/lib/types";

export type DropPoint = { x: number; y: number };
export type DropEditor = "visual" | "code";
export type DropHandler = (paths: string[], point: DropPoint) => Promise<void>;

const handlers = new Map<string, DropHandler>();

export function toCssPoint(point: DropPoint, scale: number): DropPoint {
  return { x: point.x / scale, y: point.y / scale };
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function kindFromPath(path: string): AssetKind {
  const ext = fileName(path).split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext ?? "")) return "image";
  if (["mp3", "wav", "ogg", "m4a"].includes(ext ?? "")) return "audio";
  if (["mp4", "webm"].includes(ext ?? "")) return "video";
  return "file";
}

export function mediaFor(asset: AssetInfo, name: string) {
  return { relPath: asset.relPath, kind: asset.kind, name };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function codeTagFor(asset: AssetInfo, name: string): string {
  const path = escapeHtml(asset.relPath);
  const label = escapeHtml(name);
  switch (asset.kind) {
    case "image": return `<img src="${path}" alt="${label}">`;
    case "audio": return `<audio src="${path}" controls></audio>`;
    case "video": return `<video src="${path}" controls></video>`;
    case "file": return `<a href="${path}">${label}</a>`;
  }
}

export function registerDropHandler(noteId: string, editor: DropEditor, handler: DropHandler): () => void {
  const key = `${noteId}:${editor}`;
  handlers.set(key, handler);
  return () => { if (handlers.get(key) === handler) handlers.delete(key); };
}

export function getDropHandler(noteId: string, editor: DropEditor): DropHandler | undefined {
  return handlers.get(`${noteId}:${editor}`);
}

export async function processFilesSequentially<T>(
  paths: string[], copy: (path: string) => Promise<T>, insert: (result: T, path: string) => void,
  onError: (path: string, error: unknown) => void,
): Promise<void> {
  for (const path of paths) {
    try {
      const result = await copy(path);
      insert(result, path);
    } catch (error) {
      onError(path, error);
    }
  }
}
