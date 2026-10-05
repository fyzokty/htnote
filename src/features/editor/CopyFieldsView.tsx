import { useLayoutEffect, useMemo, useRef } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import type { CopyField } from "./copyFields";
import { singleLineWidgetText } from "./widgets/widgetFormat";
import { leaveTextBox } from "./textBox";
import { WidgetHeader } from "./widgets/WidgetHeader";

export function CopyFieldsView({ node, updateAttributes, editor, getPos, selected }: NodeViewProps) {
  const { t } = useTranslation();
  const savedFields = node.attrs.fields as CopyField[];
  // Boş listenin yazım satırı yalnız görünümde kalır; özgün HTML değişmez.
  const fields = useMemo(() => savedFields.length ? savedFields : [{ label: "", value: "" }], [savedFields]);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const title = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingFocus.current !== null) {
      (inputs.current[pendingFocus.current] ?? title.current)?.focus();
      pendingFocus.current = null;
    }
  }, [fields]);
  const change = (next: CopyField[], focus?: number) => {
    if (focus !== undefined) pendingFocus.current = focus;
    updateAttributes({ fields: next, html: null });
  };
  const add = (index: number) => change([...fields.slice(0, index), { label: "", value: "" }, ...fields.slice(index)], index * 2);
  const remove = (index: number, column = 0) => change(fields.filter((_, at) => at !== index), fields.length > 1 ? Math.max(0, index - 1) * 2 + column : -1);
  const history = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.shiftKey || event.key.toLowerCase() === "y") editor.commands.redo(); else editor.commands.undo();
    }
  };
  return <NodeViewWrapper className={`htnote-copyfields-editor${selected ? " is-selected" : ""}`} contentEditable={false}
    style={{ background: node.attrs.background ? `var(--app-note-${node.attrs.background})` : undefined }} onKeyDown={history}>
    <WidgetHeader icon={<ClipboardList size={14} />} label={t("widgetTypes.copyfields")} background={node.attrs.background}
      onBackgroundChange={(background) => updateAttributes({ background })} selectLabel={t("editor.copyFields.select")}
      onSelect={() => { const position = getPos(); if (position !== undefined) editor.chain().focus().setNodeSelection(position).run(); }} />
    <input ref={title} className="htnote-copyfields-editor-title" data-testid="copyfields-title" aria-label={t("editor.copyFields.title")}
      placeholder={t("editor.copyFields.title")} value={String(node.attrs.title)} spellCheck={false}
      onChange={(event) => updateAttributes({ title: event.target.value, html: null })}
      onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); if (fields.length) inputs.current[0]?.focus(); else add(0); } }} />
    <div className="htnote-copyfields-editor-fields">
      {fields.map((field, index) => <div className="htnote-copyfields-editor-row" key={index}>
        {(["label", "value"] as const).map((column, at) => <input key={column} ref={(input) => { inputs.current[index * 2 + at] = input; }}
          className={`htnote-copyfields-editor-${column}`} data-testid={`copyfields-${column}`} spellCheck={false}
          aria-label={t(`editor.copyFields.${column}`, { index: index + 1 })} placeholder={t(`editor.copyFields.${column}Placeholder`)}
          value={field[column]} onChange={(event) => change(fields.map((entry, row) => row === index ? { ...entry, [column]: singleLineWidgetText(event.target.value) } : entry))}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text/plain");
            if (!/[\r\n]/.test(pasted)) return;
            event.preventDefault();
            const input = event.currentTarget;
            const start = input.selectionStart ?? 0, end = input.selectionEnd ?? field[column].length;
            const value = field[column].slice(0, start) + singleLineWidgetText(pasted) + field[column].slice(end);
            change(fields.map((entry, row) => row === index ? { ...entry, [column]: value } : entry));
          }} onKeyDown={(event) => {
            if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.nativeEvent.isComposing) return;
            if (event.key === "Enter") { event.preventDefault(); if (column === "label") inputs.current[index * 2 + 1]?.focus(); else add(index + 1); }
            else if (event.key === "Backspace" && !field.label && !field.value) { event.preventDefault(); remove(index, at); }
            else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              const direction = event.key === "ArrowUp" ? -1 : 1;
              if (index + direction >= 0 && index + direction < fields.length) inputs.current[(index + direction) * 2 + at]?.focus();
              else { const position = getPos(); if (position !== undefined) leaveTextBox(editor, position, node.nodeSize, direction); }
            }
          }} />)}
        <button type="button" className="htnote-copyfields-remove" title={t("editor.copyFields.remove", { index: index + 1 })} aria-label={t("editor.copyFields.remove", { index: index + 1 })} onClick={() => remove(index)}><Trash2 size={15} aria-hidden /></button>
      </div>)}
    </div>
    <button type="button" className="htnote-copyfields-add" onClick={() => add(fields.length)}><Plus size={15} aria-hidden />{t("editor.copyFields.add")}</button>
  </NodeViewWrapper>;
}
