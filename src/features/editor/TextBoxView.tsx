import { useRef } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { leaveTextBox, textBoxBoundary } from "./textBox";

export function TextBoxView({ node, updateAttributes, editor, getPos, selected }: NodeViewProps) {
  const { t } = useTranslation();
  const content = useRef<HTMLTextAreaElement>(null);
  const history = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.shiftKey || event.key.toLowerCase() === "y") editor.commands.redo(); else editor.commands.undo();
    }
  };
  return <NodeViewWrapper className={`htnote-textbox-editor${selected ? " is-selected" : ""}`} contentEditable={false}>
    <span className="htnote-textbox-handle" data-drag-handle draggable="true" role="button" tabIndex={0}
      aria-label={t("editor.textBox.select")} onClick={() => { const position = getPos(); if (position !== undefined) editor.chain().focus().setNodeSelection(position).run(); }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); const position = getPos(); if (position !== undefined) editor.chain().focus().setNodeSelection(position).run(); } }} />
    <input data-testid="textbox-title" aria-label={t("editor.textBox.title")} placeholder={t("editor.textBox.title")}
      value={String(node.attrs.title)} spellCheck={false}
      onChange={(event) => updateAttributes({ title: event.target.value, html: null })}
      onKeyDown={(event) => { history(event); if (event.key === "Enter") { event.preventDefault(); content.current?.focus(); } }} />
    <textarea ref={content} data-testid="textbox-content" aria-label={t("editor.textBox.content")} rows={3} spellCheck={false}
      value={String(node.attrs.content)} onChange={(event) => updateAttributes({ content: event.target.value, html: null })}
      onKeyDown={(event) => {
        history(event);
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const field = event.currentTarget;
        const direction = textBoxBoundary(event.key, field.value, field.selectionStart, field.selectionEnd);
        const position = getPos();
        if (direction && position !== undefined) { event.preventDefault(); leaveTextBox(editor, position, node.nodeSize, direction); }
      }} />
  </NodeViewWrapper>;
}
