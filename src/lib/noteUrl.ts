export const NOTE_IFRAME_SANDBOX = "allow-scripts allow-forms allow-same-origin allow-modals";

let noteOrigin: string | undefined;

export function initNoteOrigin(origin: string): void {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("Invalid note origin");
  noteOrigin = origin;
}

export function getNoteOrigin(): string {
  if (!noteOrigin) throw new Error("Note origin is not initialized");
  return noteOrigin;
}

export function noteUrl(id: string, path?: string): string {
  const suffix = path ? path.split("/").map(encodeURIComponent).join("/") : "";
  return `${getNoteOrigin()}/${encodeURIComponent(id)}/${suffix}`;
}
