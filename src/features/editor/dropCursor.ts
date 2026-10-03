import type { EditorView } from "@tiptap/pm/view";

import type { DropPoint } from "@/features/editor/fileDrop";

export function dropPosition(view: EditorView, point: DropPoint): number | null {
  return view.posAtCoords({ left: point.x, top: point.y })?.pos ?? null;
}

export function dropCursorRect(view: EditorView, pos: number) {
  const $pos = view.state.doc.resolve(pos);
  if (!$pos.parent.inlineContent && ($pos.nodeBefore || $pos.nodeAfter)) {
    const before = $pos.nodeBefore;
    const dom = view.nodeDOM(pos - (before?.nodeSize ?? 0));
    if (dom instanceof HTMLElement) {
      const rect = dom.getBoundingClientRect();
      const after = before && $pos.nodeAfter ? view.nodeDOM(pos) : null;
      const top = after instanceof HTMLElement ? (rect.bottom + after.getBoundingClientRect().top) / 2
        : before ? rect.bottom : rect.top;
      const editorRect = view.dom.getBoundingClientRect();
      return { left: editorRect.left, top: top - 1, width: editorRect.width, height: 2 };
    }
  }
  const rect = view.coordsAtPos(pos);
  return { left: rect.left - 1, top: rect.top, width: 2, height: rect.bottom - rect.top };
}

export function createNativeDropCursor(view: EditorView) {
  const cursor = document.createElement("div");
  cursor.className = "htnote-drop-cursor htnote-native-drop-cursor";
  cursor.setAttribute("aria-hidden", "true");
  let point: DropPoint | null = null;
  const clear = () => { point = null; cursor.remove(); };
  const draw = () => {
    if (!point) return;
    const pos = dropPosition(view, point);
    if (pos === null) { clear(); return; }
    const rect = dropCursorRect(view, pos);
    Object.assign(cursor.style, Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, `${value}px`])));
    if (!cursor.isConnected) document.body.append(cursor);
  };
  document.addEventListener("scroll", draw, true);
  window.addEventListener("resize", clear);
  window.addEventListener("blur", clear);
  return {
    update(next: DropPoint | null) { point = next; if (next) draw(); else clear(); },
    destroy() {
      clear();
      document.removeEventListener("scroll", draw, true);
      window.removeEventListener("resize", clear);
      window.removeEventListener("blur", clear);
    },
  };
}
