import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import { insertWidget } from "./widgets/widgetCommands";
import { ChecklistView } from "./ChecklistView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    checklist: { insertChecklist: () => ReturnType };
  }
}

export const Checklist = Node.create({
  name: "checklist",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { title: { default: "" }, items: { default: [{ text: "", checked: false }] }, html: { default: null }, background: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "htnote-checklist-node[data-checklist]", getAttrs: (element) => JSON.parse(element.getAttribute("data-checklist") ?? "{}") }];
  },
  renderHTML({ node }) {
    // Geçici taşıyıcı yalnız görsel boru hattında kullanılır, nota yazılmaz.
    return ["htnote-checklist-node", { "data-checklist": JSON.stringify(node.attrs) }];
  },
  addCommands() {
    return { insertChecklist: () => insertWidget(this.name) };
  },
  addProseMirrorPlugins() {
    return [new Plugin({ appendTransaction: (transactions, _old, state) => {
      if (!transactions.some((transaction) => transaction.docChanged) || state.doc.lastChild?.type.name !== this.name) return null;
      return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create());
    } })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ChecklistView, {
      stopEvent: ({ event }) => event.target instanceof Element && !!event.target.closest("input,textarea,button,.htnote-color-popover"),
      ignoreMutation: () => true,
    });
  },
});
