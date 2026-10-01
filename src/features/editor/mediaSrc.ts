import { noteUrl } from "@/lib/noteUrl";

export function resolveMediaSrc(noteId: string, src: string): string {
  if (!src || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(src) || !noteId) return src;
  return noteUrl(noteId, src.replace(/^\.\//, ""));
}
