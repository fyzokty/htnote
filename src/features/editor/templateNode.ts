import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import { TemplateView } from "./TemplateView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    template: { insertTemplate: () => ReturnType };
  }
}

export const Template = Node.create({
  name: "template",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { title: { default: "" }, content: { default: "" }, html: { default: null }, background: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "htnote-template-node[data-template]", getAttrs: (element) => JSON.parse(element.getAttribute("data-template") ?? "{}") }];
  },
  renderHTML({ node }) {
    // Geçici taşıyıcı yalnız görsel boru hattında kullanılır, nota yazılmaz.
    return ["htnote-template-node", { "data-template": JSON.stringify(node.attrs) }];
  },
  addCommands() {
    return { insertTemplate: () => ({ commands }) => commands.insertContent({ type: this.name }) };
  },
  addProseMirrorPlugins() {
    return [new Plugin({ appendTransaction: (transactions, _old, state) => {
      if (!transactions.some((transaction) => transaction.docChanged) || state.doc.lastChild?.type.name !== this.name) return null;
      return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create());
    } })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TemplateView, {
      stopEvent: ({ event }) => event.target instanceof Element && !!event.target.closest("input,textarea,button,.htnote-color-popover"),
      ignoreMutation: () => true,
    });
  },
});
