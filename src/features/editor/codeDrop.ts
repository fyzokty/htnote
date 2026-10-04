import type { EditorView } from "@codemirror/view";
import type { DropPoint } from "./fileDrop";
import { formatHtml } from "./formatHtml";

export function resolveCodeDropPosition(position: number | null, fallback: number, length: number): number {
  return Math.max(0, Math.min(position ?? fallback, length));
}

export function codeDropPosition(view: EditorView, point: DropPoint): number {
  return resolveCodeDropPosition(view.posAtCoords(point), view.state.selection.main.head, view.state.doc.length);
}

export function codeDropCursorRect(view: EditorView, position: number) {
  const rect = view.coordsAtPos(position);
  return rect ? { left: rect.left - 1, top: rect.top, width: 2, height: rect.bottom - rect.top } : null;
}

export function createCodeDropCursor(view: EditorView) {
  const cursor = document.createElement("div");
  cursor.className = "htnote-drop-cursor htnote-native-drop-cursor";
  cursor.setAttribute("aria-hidden", "true");
  let point: DropPoint | null = null;
  const clear = () => { point = null; cursor.remove(); };
  const draw = () => {
    if (!point) return;
    const rect = codeDropCursorRect(view, codeDropPosition(view, point));
    if (!rect) { cursor.remove(); return; }
    Object.assign(cursor.style, Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, `${value}px`])));
    if (!cursor.isConnected) document.body.append(cursor);
  };
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
  observer?.observe(view.dom);
  document.addEventListener("scroll", draw, true);
  window.addEventListener("resize", draw);
  window.addEventListener("blur", clear);
  return {
    update(next: DropPoint | null) { point = next; if (point) draw(); else clear(); },
    destroy() {
      clear(); observer?.disconnect();
      document.removeEventListener("scroll", draw, true);
      window.removeEventListener("resize", draw);
      window.removeEventListener("blur", clear);
    },
  };
}

export function formattedDropCursor(document: string, lastTag: string, occurrence: number, fallback: number): number {
  // Biçimlendirici etiketlerin kaynak dilimlerini korur; aynı asset yeniden eklenebilir.
  const opening = lastTag.match(/^<[^>]+>/)?.[0];
  if (!opening) return resolveCodeDropPosition(null, fallback, document.length);
  let start = -1;
  for (let count = 0; count <= occurrence; count++) {
    start = document.indexOf(opening, start + 1);
    if (start < 0) return resolveCodeDropPosition(null, fallback, document.length);
  }
  const name = lastTag.match(/^<([a-z]+)/i)?.[1];
  const closing = name && lastTag.includes(`</${name}>`) ? `</${name}>` : null;
  const end = closing ? document.indexOf(closing, start + opening.length) : -1;
  if (closing && end < 0) return resolveCodeDropPosition(null, fallback, document.length);
  return closing ? end + closing.length : start + opening.length;
}

export function prepareCodeDrop(original: string, position: number, tags: string[], formatter = formatHtml) {
  const from = resolveCodeDropPosition(position, 0, original.length);
  const insert = tags.join("");
  const last = tags[tags.length - 1] ?? "";
  const opening = last.match(/^<[^>]+>/)?.[0];
  const prefix = original.slice(0, from) + tags.slice(0, -1).join("");
  const occurrence = opening ? prefix.split(opening).length - 1 : 0;
  const inserted = original.slice(0, from) + insert + original.slice(from);
  try {
    const document = formatter(inserted);
    return { document, cursor: formattedDropCursor(document, last, occurrence, from) };
  } catch {
    // Biçimlendirme başarısız olsa bile kopyalanan dosya etiketleri korunur.
    return { document: inserted, cursor: from + insert.length };
  }
}
