import { Extension } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { NodeSelection, Plugin, Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export function selectMediaGap(view: EditorView, event: MouseEvent): boolean {
  if (!view.editable || event.button !== 0) return false;
  // Hit-test targets can differ between WebView2 versions. Preserve toolbar
  // interactions using their actual bounds, including overhanging toolbars.
  const containsPoint = (rect: DOMRect) => event.clientX >= rect.left && event.clientX <= rect.right
    && event.clientY >= rect.top && event.clientY <= rect.bottom;
  for (const toolbar of view.dom.querySelectorAll(".htnote-media-toolbar")) {
    if (containsPoint(toolbar.getBoundingClientRect())) return false;
  }
  let boundary: number | null = null;
  let bias = 1;
  view.state.doc.descendants((node, pos) => {
    if (boundary !== null || !["image", "audio", "video"].includes(node.type.name)) return;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    const row = dom.getBoundingClientRect();
    if (event.clientY < row.top || event.clientY > row.bottom) return;
    const rect = (dom.querySelector(".htnote-media-preview") ?? dom).getBoundingClientRect();
    if (containsPoint(rect)) return;
    bias = event.clientX < rect.left ? -1 : event.clientX > rect.right ? 1 : event.clientY < rect.top ? -1 : 1;
    boundary = pos + (bias === 1 ? node.nodeSize : 0);
  });
  if (boundary === null) return false;
  const $pos = view.state.doc.resolve(boundary);
  const near = Selection.near($pos, bias);
  const selection = near instanceof NodeSelection && $pos.parent.contentMatchAt($pos.index()).defaultType?.isTextblock
    ? new GapCursor($pos) : near;
  view.dispatch(view.state.tr.setSelection(selection));
  view.focus();
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
          if (!selectMediaGap(view, event)) return;
          event.preventDefault();
          event.stopPropagation();
        };
        view.dom.addEventListener("mousedown", mousedown, true);
        return { destroy: () => view.dom.removeEventListener("mousedown", mousedown, true) };
      },
    })];
  },
});
