import { getPlatform } from "@/lib/shortcuts/registry";

export const NOTE_IFRAME_SANDBOX = "allow-scripts allow-forms allow-same-origin allow-modals";

export const NOTE_ORIGIN = getPlatform() === "windows"
  || (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent))
  ? "http://htnote-note.localhost"
  : "htnote-note://localhost";

export function noteUrl(id: string, path?: string): string {
  const suffix = path ? path.split("/").map(encodeURIComponent).join("/") : "";
  return `${NOTE_ORIGIN}/${encodeURIComponent(id)}/${suffix}`;
}
