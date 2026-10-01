import { Extension } from "@tiptap/core";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Plugin } from "@tiptap/pm/state";

import { useTreeStore } from "@/stores/treeStore";

const noteIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function noteLinkHref(id: string): string {
  if (!noteIdPattern.test(id)) throw new Error("Invalid note ID");
  return `htnote://note/${id}`;
}

export function parseNoteLinkId(href: string): string | null {
  const match = /^htnote:\/\/note\/([^/?#]+)$/i.exec(href);
  return match && noteIdPattern.test(match[1]) ? match[1] : null;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function codeNoteLink(id: string, title: string): string {
  return `<a href="${noteLinkHref(id)}">${escapeHtml(title)}</a>`;
}

export const NoteLinkDecorations = Extension.create({
  name: "noteLinkDecorations",
  addProseMirrorPlugins() {
    return [new Plugin({
      view: (view) => {
        const unsubscribe = useTreeStore.subscribe((state, previous) => {
          if (state.tree !== previous.tree) view.dispatch(view.state.tr);
        });
        return { destroy: unsubscribe };
      },
      props: {
        decorations(state) {
          const decorations: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (!node.isText) return;
            for (const mark of node.marks) {
              if (mark.type.name !== "link") continue;
              const id = parseNoteLinkId(mark.attrs.href ?? "");
              if (!id) continue;
              const note = useTreeStore.getState().findNoteById(id);
              decorations.push(Decoration.inline(pos, pos + node.nodeSize, {
                class: note ? "htnote-note-link" : "htnote-note-link htnote-note-link-broken",
                title: note?.title ?? "",
              }));
            }
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
    })];
  },
});

export function noteLinkShortcut(onOpen: () => void) {
  return Extension.create({
    name: "noteLinkShortcut",
    addKeyboardShortcuts() {
      return { "Mod-k": () => { onOpen(); return true; } };
    },
  });
}
