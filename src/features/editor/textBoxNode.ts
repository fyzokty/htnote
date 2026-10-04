import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import { TextBoxView } from "./TextBoxView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textBox: { insertTextBox: () => ReturnType };
  }
}

export const TextBox = Node.create({
  name: "textBox",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { title: { default: "" }, content: { default: "" }, html: { default: null } };
  },
  parseHTML() {
    return [{ tag: "htnote-textbox-node[data-box]", getAttrs: (element) => JSON.parse(element.getAttribute("data-box") ?? "{}") }];
  },
  renderHTML({ node }) {
    // Geçici taşıyıcı yalnız görsel boru hattında kullanılır, nota yazılmaz.
    return ["htnote-textbox-node", { "data-box": JSON.stringify(node.attrs) }];
  },
  addCommands() {
    return { insertTextBox: () => ({ commands }) => commands.insertContent({ type: this.name }) };
  },
  addProseMirrorPlugins() {
    return [new Plugin({ appendTransaction: (transactions, _old, state) => {
      if (!transactions.some((transaction) => transaction.docChanged) || state.doc.lastChild?.type.name !== this.name) return null;
      return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create());
    } })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TextBoxView, {
      stopEvent: ({ event }) => event.target instanceof Element && !!event.target.closest("input,textarea"),
      ignoreMutation: () => true,
    });
  },
});
