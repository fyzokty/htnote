import { useLayoutEffect, useRef } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { Calculator, FileText, TextCursorInput } from "lucide-react";
import { leaveTextBox, textBoxBoundary } from "../textBox";
import { WidgetHeader } from "./WidgetHeader";

import { parseTemplate } from "../template";
import { evaluateCalc } from "../calc";

export function TextareaWidgetView({ node, updateAttributes, editor, getPos, selected, kind }: NodeViewProps & { kind: "textbox" | "template" | "calc" }) {
  const { t, i18n } = useTranslation();
  const content = useRef<HTMLTextAreaElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const labelKey = kind === "textbox" ? "editor.textBox" : kind === "template" ? "editor.template" : "editor.calc";
  const value = String(node.attrs.content);
  const variables = kind === "template" ? parseTemplate(value).variables : [];
  const calculation = kind === "calc" ? evaluateCalc(value, i18n.resolvedLanguage?.split("-")[0]) : null;
  useLayoutEffect(() => {
    const field = content.current;
    if (field && (kind === "calc" || !window.CSS?.supports?.("field-sizing", "content"))) {
      field.style.height = "auto";
      field.style.height = `${Math.max(field.scrollHeight, 3 * (parseFloat(getComputedStyle(field).lineHeight) || 21))}px`;
    }
  }, [value, kind]);
  const history = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.shiftKey || event.key.toLowerCase() === "y") editor.commands.redo(); else editor.commands.undo();
    }
  };
  return <NodeViewWrapper className={`htnote-${kind}-editor${selected ? " is-selected" : ""}`} contentEditable={false}
    style={{ background: node.attrs.background ? `var(--app-note-${node.attrs.background})` : undefined }}>
    <WidgetHeader icon={kind === "calc" ? <Calculator size={14} /> : kind === "template" ? <FileText size={14} /> : <TextCursorInput size={14} />} label={t(`widgetTypes.${kind}`)}
      background={node.attrs.background} onBackgroundChange={(background) => updateAttributes({ background })}
      selectLabel={t(`${labelKey}.select`)}
      onSelect={() => { const position = getPos(); if (position !== undefined) editor.chain().focus().setNodeSelection(position).run(); }} />
    <input data-testid={`${kind}-title`} aria-label={t(`${labelKey}.title`)} placeholder={t(`${labelKey}.title`)}
      value={String(node.attrs.title)} spellCheck={false}
      onChange={(event) => updateAttributes({ title: event.target.value, html: null })}
      onKeyDown={(event) => { history(event); if (event.key === "Enter") { event.preventDefault(); content.current?.focus(); } }} />
    <div className={kind === "calc" ? "htnote-calc-editor-lines" : undefined}>
    <textarea ref={content} data-testid={`${kind}-content`} aria-label={t(`${labelKey}.content`)} rows={3} spellCheck={false}
      value={value} onChange={(event) => updateAttributes({ content: event.target.value, html: null })}
      onScroll={(event) => { if (results.current) results.current.scrollTop = event.currentTarget.scrollTop; }}
      onKeyDown={(event) => {
        history(event);
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const field = event.currentTarget;
        const direction = textBoxBoundary(event.key, field.value, field.selectionStart, field.selectionEnd);
        const position = getPos();
        if (direction && position !== undefined) { event.preventDefault(); leaveTextBox(editor, position, node.nodeSize, direction); }
      }} />
    {calculation && <div ref={results} className="htnote-calc-editor-results">
      {calculation.lines.map((line, index) => <div key={index} data-testid="calc-result" className={line.status === "error" ? "htnote-calc-error" : undefined}
        title={line.status === "error" ? t("calc.error") : undefined} aria-label={line.status === "error" ? t("calc.error") : undefined}>{line.formatted}</div>)}
    </div>}
    </div>
    {calculation && <>
      {calculation.limited && <p className="htnote-calc-error" role="status">{t("calc.limit")}</p>}
      <div className="htnote-calc-editor-total"><strong>{t("calc.total")}</strong><strong data-testid="calc-total">{calculation.formattedTotal}</strong></div>
    </>}
    {kind === "template" && <div className="htnote-template-editor-info">
      <p>{t("editor.template.hint", { interpolation: { prefix: "[[", suffix: "]]" } })}</p>
      {!!variables.length && <div className="htnote-template-editor-variables" aria-label={t("editor.template.detected")}>
        <span>{t("editor.template.detected")}</span>
        {variables.map((variable) => <span className="htnote-template-chip" key={variable.key}>{variable.name}</span>)}
      </div>}
    </div>}
  </NodeViewWrapper>;
}
