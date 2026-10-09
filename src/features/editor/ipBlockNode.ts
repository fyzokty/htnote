import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import { insertWidget } from "./widgets/widgetCommands";
import { IpBlockView } from "./IpBlockView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    ipblock: { insertIpBlock: () => ReturnType };
  }
}

export const IpBlock = Node.create({
  name: "ipblock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return { title: { default: "" }, gateway: { default: "" }, prefix: { default: 28 }, html: { default: null }, background: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "htnote-ipblock-node[data-ipblock]", getAttrs: (element) => JSON.parse(element.getAttribute("data-ipblock") ?? "{}") }];
  },
  renderHTML({ node }) {
    // Geçici taşıyıcı yalnız görsel boru hattında kullanılır, nota yazılmaz.
    return ["htnote-ipblock-node", { "data-ipblock": JSON.stringify(node.attrs) }];
  },
  addCommands() {
    return { insertIpBlock: () => insertWidget(this.name) };
  },
  addProseMirrorPlugins() {
    return [new Plugin({ appendTransaction: (transactions, _old, state) => {
      if (!transactions.some((transaction) => transaction.docChanged) || state.doc.lastChild?.type.name !== this.name) return null;
      return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create());
    } })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(IpBlockView, {
      stopEvent: ({ event }) => event.target instanceof Element && !!event.target.closest("input,textarea,select,button,.htnote-color-popover"),
      ignoreMutation: () => true,
    });
  },
});
