export type ClipboardKind = "files" | "dataUrlHtml" | "externalImages" | "plain";

export function classifyClipboard(data: { files: ArrayLike<File>; getData: (type: string) => string }): ClipboardKind {
  if (data.files.length > 0) return "files";
  const html = data.getData("text/html");
  if (!html) return "plain";
  const document = new DOMParser().parseFromString(html, "text/html");
  const sources = Array.from(document.querySelectorAll("img[src]"), (image) => image.getAttribute("src") ?? "");
  if (sources.some((src) => /^data:image\//i.test(src))) return "dataUrlHtml";
  if (sources.some((src) => /^https?:\/\//i.test(src))) return "externalImages";
  return "plain";
}

export function extFromMime(mime: string): string {
  const extensions: Record<string, string> = {
    "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
    "image/svg+xml": "svg", "image/avif": "avif", "audio/mpeg": "mp3",
    "audio/wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a",
    "video/mp4": "mp4", "video/webm": "webm",
  };
  return extensions[mime.split(";")[0].trim().toLowerCase()] ?? "png";
}

export function pasteFileName(date: Date, mime: string): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `yapistirilan-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.${extFromMime(mime)}`;
}

export function decodeDataUrl(url: string): { bytes: Uint8Array; mime: string } {
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/i.exec(url);
  if (!match) throw new Error("Invalid data URL");
  const [, mime, base64, payload] = match;
  if (!mime.toLowerCase().startsWith("image/")) throw new Error("Unsupported data URL");
  if (!base64) return { bytes: new TextEncoder().encode(decodeURIComponent(payload)), mime };
  const binary = atob(payload);
  return { bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)), mime };
}

export async function rewriteDataUrlImages(html: string, saver: (url: string) => Promise<string>): Promise<string> {
  const document = new DOMParser().parseFromString(html, "text/html");
  for (const image of document.querySelectorAll("img[src]")) {
    const src = image.getAttribute("src") ?? "";
    if (/^data:image\//i.test(src)) image.setAttribute("src", await saver(src));
  }
  return document.body.innerHTML;
}

let externalImageWarningShown = false;

export function shouldWarnExternalImages(): boolean {
  if (externalImageWarningShown) return false;
  externalImageWarningShown = true;
  return true;
}
