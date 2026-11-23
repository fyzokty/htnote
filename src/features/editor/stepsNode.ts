import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import { insertWidget } from "./widgets/widgetCommands";
import { emptyStep } from "./steps";
import { StepsView } from "./StepsView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    steps: { insertSteps: () => ReturnType };
  }
}

export const Steps = Node.create({
  name: "steps",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addOptions() { return { noteId: "" }; },
  addAttributes() {
    return { title: { default: "" }, items: { default: [emptyStep()] }, html: { default: null }, background: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "htnote-steps-node[data-steps]", getAttrs: (element) => JSON.parse(element.getAttribute("data-steps") ?? "{}") }];
  },
  renderHTML({ node }) {
    // Geçici taşıyıcı yalnız görsel boru hattında kullanılır, nota yazılmaz.
    return ["htnote-steps-node", { "data-steps": JSON.stringify(node.attrs) }];
  },
  addCommands() {
    return { insertSteps: () => insertWidget(this.name) };
  },
  addProseMirrorPlugins() {
    return [new Plugin({ appendTransaction: (transactions, _old, state) => {
      if (!transactions.some((transaction) => transaction.docChanged) || state.doc.lastChild?.type.name !== this.name) return null;
      return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create());
    } })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(StepsView, {
      stopEvent: ({ event }) => event.target instanceof Element && !!event.target.closest("input,textarea,button,.htnote-color-popover"),
      ignoreMutation: () => true,
    });
  },
});
