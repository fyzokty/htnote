import { open } from "@tauri-apps/plugin-dialog";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"];

export async function pickMediaPaths(filter: { name: string; extensions: string[] }, multiple = true): Promise<string[]> {
  const selected = await open({ multiple, filters: [filter] });
  return selected ? Array.isArray(selected) ? selected : [selected] : [];
}
