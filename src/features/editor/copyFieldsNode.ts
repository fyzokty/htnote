import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import { insertWidget } from "./widgets/widgetCommands";
import { CopyFieldsView } from "./CopyFieldsView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    copyfields: { insertCopyFields: () => ReturnType };
  }
}

export const CopyFields = Node.create({
  name: "copyfields",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { title: { default: "" }, fields: { default: [{ label: "", value: "" }] }, html: { default: null }, background: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "htnote-copyfields-node[data-copyfields]", getAttrs: (element) => JSON.parse(element.getAttribute("data-copyfields") ?? "{}") }];
  },
  renderHTML({ node }) {
    // Geçici taşıyıcı yalnız görsel boru hattında kullanılır, nota yazılmaz.
    return ["htnote-copyfields-node", { "data-copyfields": JSON.stringify(node.attrs) }];
  },
  addCommands() {
    return { insertCopyFields: () => insertWidget(this.name) };
  },
  addProseMirrorPlugins() {
    return [new Plugin({ appendTransaction: (transactions, _old, state) => {
      if (!transactions.some((transaction) => transaction.docChanged) || state.doc.lastChild?.type.name !== this.name) return null;
      return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create());
    } })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CopyFieldsView, {
      stopEvent: ({ event }) => event.target instanceof Element && !!event.target.closest("input,textarea,button,.htnote-color-popover"),
      ignoreMutation: () => true,
    });
  },
});
