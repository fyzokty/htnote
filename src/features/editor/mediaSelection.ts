import { Extension } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { NodeSelection, Plugin, Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export function selectMediaGap(view: EditorView, event: MouseEvent): boolean {
  if (!view.editable || event.button !== 0 || (event.target instanceof Element && event.target.closest(".htnote-media-preview, .htnote-media-toolbar"))) return false;
  let boundary: number | null = null;
  let bias = 1;
  view.state.doc.descendants((node, pos) => {
    if (boundary !== null || !["image", "audio", "video"].includes(node.type.name)) return;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    const row = dom.getBoundingClientRect();
    if (event.clientY < row.top || event.clientY > row.bottom) return;
    const rect = (dom.querySelector(".htnote-media-preview") ?? dom).getBoundingClientRect();
    if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) return;
    bias = event.clientY < rect.top || event.clientX < rect.left ? -1 : 1;
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
    return [new Plugin({ props: { handleDOMEvents: {
      mousedown: (view, event) => {
        // Handle the gap before native caret placement / ProseMirror hit testing
        // can select the nearest atom and render its toolbar during the click.
        if (!selectMediaGap(view, event)) return false;
        event.preventDefault();
        return true;
      },
    } } })];
  },
});
