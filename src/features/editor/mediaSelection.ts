import { Extension } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { NodeSelection, Plugin, Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export interface MediaClickDebug {
  calls: number;
  last?: {
    x: number; y: number; button: number; isTrusted: boolean;
    target: { tag: string; className: string } | null;
    decision: string;
    rows: { pos: number; kind: string; row: object; preview: object }[];
    boundary: number | null;
    bias: number;
    before: object;
    after?: object;
    handled?: boolean;
    defaultPrevented?: boolean;
  };
}

declare global {
  interface Window { __htnoteDebugMediaClick?: MediaClickDebug }
}

export function selectMediaGap(view: EditorView, event: MouseEvent, debug?: MediaClickDebug["last"]): boolean {
  if (!view.editable || event.button !== 0) {
    if (debug) debug.decision = !view.editable ? "not-editable" : "not-left-button";
    return false;
  }
  // Hit-test targets can differ between WebView2 versions. Preserve toolbar
  // interactions using their actual bounds, including overhanging toolbars.
  const containsPoint = (rect: DOMRect) => event.clientX >= rect.left && event.clientX <= rect.right
    && event.clientY >= rect.top && event.clientY <= rect.bottom;
  for (const toolbar of view.dom.querySelectorAll(".htnote-media-toolbar")) {
    if (containsPoint(toolbar.getBoundingClientRect())) {
      if (debug) debug.decision = "inside-toolbar";
      return false;
    }
  }
  let boundary: number | null = null;
  let bias = 1;
  view.state.doc.descendants((node, pos) => {
    if (boundary !== null || !["image", "audio", "video"].includes(node.type.name)) return;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    const row = dom.getBoundingClientRect();
    const outsideRow = event.clientY < row.top || event.clientY > row.bottom;
    if (outsideRow && !debug) return;
    const rect = (dom.querySelector(".htnote-media-preview") ?? dom).getBoundingClientRect();
    if (debug) debug.rows.push({ pos, kind: node.type.name, row: row.toJSON(), preview: rect.toJSON() });
    if (outsideRow) return;
    if (containsPoint(rect)) return;
    bias = event.clientX < rect.left ? -1 : event.clientX > rect.right ? 1 : event.clientY < rect.top ? -1 : 1;
    boundary = pos + (bias === 1 ? node.nodeSize : 0);
  });
  if (debug) { debug.boundary = boundary; debug.bias = bias; }
  if (boundary === null) {
    if (debug) debug.decision = "no-outside-media-boundary";
    return false;
  }
  const $pos = view.state.doc.resolve(boundary);
  const near = Selection.near($pos, bias);
  const selection = near instanceof NodeSelection && $pos.parent.contentMatchAt($pos.index()).defaultType?.isTextblock
    ? new GapCursor($pos) : near;
  view.dispatch(view.state.tr.setSelection(selection));
  view.focus();
  if (debug) debug.decision = "selected-media-boundary";
  return true;
}

export const MediaSelection = Extension.create({
  name: "mediaSelection",
  priority: 1100,
  addProseMirrorPlugins() {
    return [new Plugin({
      view: (view) => {
        // Capture before NodeView.stopEvent and ProseMirror's coordinate hit
        // testing. Even an outside click targeted at a player uses this row.
        const mousedown = (event: MouseEvent) => {
          // Explicit e2e opt-in: normal builds do not create or retain traces.
          const debug = window.__htnoteDebugMediaClick;
          const trace: MediaClickDebug["last"] = debug ? {
            x: event.clientX, y: event.clientY, button: event.button, isTrusted: event.isTrusted,
            target: event.target instanceof Element ? { tag: event.target.tagName, className: event.target.getAttribute("class") ?? "" } : null,
            decision: "entered", rows: [], boundary: null, bias: 1, before: view.state.selection.toJSON(),
          } : undefined;
          if (debug) { debug.calls += 1; debug.last = trace; }
          const handled = selectMediaGap(view, event, trace);
          if (trace) { trace.handled = handled; trace.after = view.state.selection.toJSON(); }
          if (!handled) {
            if (trace) trace.defaultPrevented = event.defaultPrevented;
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (trace) trace.defaultPrevented = event.defaultPrevented;
        };
        view.dom.addEventListener("mousedown", mousedown, true);
        return { destroy: () => view.dom.removeEventListener("mousedown", mousedown, true) };
      },
    })];
  },
});
