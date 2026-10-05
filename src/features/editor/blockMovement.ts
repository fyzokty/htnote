import { Extension, type Editor } from "@tiptap/core";
import { Plugin, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { blockAt, blockMoveTransaction, keyboardBlockTarget } from "./blockMove";

const focusTransactions = new WeakMap<EditorView, Transaction>();
export function dispatchBlockMove(editor: Editor, tr: Transaction) {
  // Odak metadata'sı da bırakmanın tek transaction'ına katılır.
  focusTransactions.set(editor.view, tr);
  try { editor.view.focus(); } finally { focusTransactions.delete(editor.view); }
  editor.view.dispatch(tr);
}

export const BlockMovement = Extension.create({
  name: "blockMovement",
  priority: 1000,
  addProseMirrorPlugins() {
    return [new Plugin({ props: { handleDOMEvents: { focus: (view, event) => {
      const tr = focusTransactions.get(view);
      if (!tr) return false;
      this.editor.isFocused = true; tr.setMeta("focus", { event });
      return true;
    } } }, view: (view) => {
      const keydown = (event: KeyboardEvent) => {
        if (!view.editable || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
        // Atom girdilerinde imleç DOM'dadır; ProseMirror seçimi eski blokta kalabilir.
        let pos = view.state.selection.from;
        if (event.target instanceof Element && event.target.closest("input,textarea")) {
          let dom = event.target as HTMLElement;
          while (dom.parentElement && dom.parentElement !== view.dom && !dom.parentElement.classList.contains("htnote-board-cell")) dom = dom.parentElement;
          pos = view.posAtDOM(dom, 0);
        }
        const source = blockAt(view.state.doc, pos);
        const target = source && keyboardBlockTarget(view.state.doc, source, event.key === "ArrowUp" ? -1 : 1);
        const tr = source && target && blockMoveTransaction(view.state, source, target);
        event.preventDefault(); event.stopImmediatePropagation();
        if (tr) dispatchBlockMove(this.editor, tr);
      };
      view.dom.addEventListener("keydown", keydown, true);
      return { destroy: () => view.dom.removeEventListener("keydown", keydown, true) };
    } })];
  },
});
