import { useLayoutEffect, useMemo, useRef } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import type { ChecklistItem } from "./checklist";
import { leaveTextBox } from "./textBox";
import { WidgetHeader } from "./widgets/WidgetHeader";
import { SingleLineTextarea } from "./widgets/SingleLineTextarea";
import { singleLineWidgetText } from "./widgets/widgetFormat";

export function ChecklistView({ node, updateAttributes, editor, getPos, selected }: NodeViewProps) {
  const { t } = useTranslation();
  const savedItems = node.attrs.items as ChecklistItem[];
  // Boş listenin yazım satırı yalnız görünümde kalır; özgün HTML değişmez.
  const items = useMemo(() => savedItems.length ? savedItems : [{ text: "", checked: false }], [savedItems]);
  const fields = useRef<(HTMLTextAreaElement | null)[]>([]);
  const title = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingFocus.current !== null) {
      (fields.current[pendingFocus.current] ?? title.current)?.focus();
      pendingFocus.current = null;
    }
  }, [items]);
  const change = (next: ChecklistItem[], focus?: number) => {
    if (focus !== undefined) pendingFocus.current = focus;
    updateAttributes({ items: next, html: null });
  };
  const add = (index: number) => change([...items.slice(0, index), { text: "", checked: false }, ...items.slice(index)], index);
  const remove = (index: number) => change(items.filter((_, at) => at !== index), Math.max(0, index - 1));
  const history = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.shiftKey || event.key.toLowerCase() === "y") editor.commands.redo(); else editor.commands.undo();
    }
  };
  return <NodeViewWrapper className={`htnote-checklist-editor${selected ? " is-selected" : ""}`} contentEditable={false}
    data-widget-background={node.attrs.background || undefined}
    style={{ background: node.attrs.background ? `var(--app-note-${node.attrs.background})` : undefined }} onKeyDown={history}>
    <WidgetHeader icon={<ListChecks size={14} />} label={t("widgetTypes.checklist")} background={node.attrs.background}
      onBackgroundChange={(background) => updateAttributes({ background })} selectLabel={t("editor.checklist.select")}
      onSelect={() => { const position = getPos(); if (position !== undefined) editor.chain().focus().setNodeSelection(position).run(); }}>
      <input ref={title} className="htnote-checklist-editor-title" data-testid="checklist-title" aria-label={t("editor.checklist.title")}
        placeholder={t("editor.checklist.title")} value={String(node.attrs.title)} spellCheck={false}
        onChange={(event) => updateAttributes({ title: event.target.value, html: null })}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (items.length) fields.current[0]?.focus(); else add(0); } }} />
    </WidgetHeader>
    <div className="htnote-checklist-editor-items">
      {items.map((item, index) => <div className="htnote-checklist-editor-row" key={index}>
        <input type="checkbox" aria-label={t("editor.checklist.checked", { index: index + 1 })} checked={item.checked}
          onChange={(event) => change(items.map((entry, at) => at === index ? { ...entry, checked: event.target.checked } : entry))} />
        <SingleLineTextarea ref={(field) => { fields.current[index] = field; }} data-testid="checklist-item" aria-label={t("editor.checklist.item", { index: index + 1 })}
          value={item.text} onChange={(event) => change(items.map((entry, at) => at === index ? { ...entry, text: singleLineWidgetText(event.target.value) } : entry))}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text/plain");
            if (!/[\r\n]/.test(pasted)) return;
            event.preventDefault();
            const field = event.currentTarget;
            const lines = (item.text.slice(0, field.selectionStart ?? 0) + pasted + item.text.slice(field.selectionEnd ?? item.text.length)).split(/\r\n|\r|\n/);
            change([...items.slice(0, index), ...lines.map((text, at) => ({ text, checked: at === 0 && item.checked })), ...items.slice(index + 1)], index + lines.length - 1);
          }} onKeyDown={(event) => {
            if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.nativeEvent.isComposing) return;
            if (event.key === "Enter") { event.preventDefault(); add(index + 1); }
            else if (event.key === "Backspace" && !item.text) { event.preventDefault(); remove(index); }
            else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              const direction = event.key === "ArrowUp" ? -1 : 1;
              const next = fields.current[index + direction];
              if (index + direction >= 0 && index + direction < items.length) next?.focus();
              else { const position = getPos(); if (position !== undefined) leaveTextBox(editor, position, node.nodeSize, direction); }
            }
          }} />
        <button type="button" className="htnote-checklist-remove" aria-label={t("editor.checklist.remove", { index: index + 1 })} onClick={() => remove(index)}><Trash2 size={15} aria-hidden /></button>
      </div>)}
    </div>
    <button type="button" className="htnote-checklist-add" onClick={() => add(items.length)}><Plus size={15} aria-hidden />{t("editor.checklist.add")}</button>
  </NodeViewWrapper>;
}
