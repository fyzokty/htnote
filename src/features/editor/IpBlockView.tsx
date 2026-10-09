import { useId, useRef } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { Network, Info, Eye } from "lucide-react";
import { calculateIpBlock, IP_PREFIXES } from "./ipBlock";
import { leaveTextBox, textBoxBoundary } from "./textBox";
import { WidgetHeader } from "./widgets/WidgetHeader";
import { useWidgetFeedback } from "./widgets/widgetMotion";

export function IpBlockView({ node, updateAttributes, editor, getPos, selected }: NodeViewProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const gateway = useRef<HTMLInputElement>(null);
  const prefix = useRef<HTMLSelectElement>(null);
  const result = calculateIpBlock(String(node.attrs.gateway), Number(node.attrs.prefix));
  const count = new Intl.NumberFormat(i18n.resolvedLanguage).format(result.hosts.length);
  const { ref: previewRef, markChanged: markPreviewChanged } = useWidgetFeedback<HTMLDivElement>(JSON.stringify([result.error, result.hosts]));
  const history = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.shiftKey || event.key.toLowerCase() === "y") editor.commands.redo(); else editor.commands.undo();
    }
  };
  return <NodeViewWrapper className={`htnote-ipblock-editor${selected ? " is-selected" : ""}`} contentEditable={false}
    data-widget-background={node.attrs.background || undefined}
    style={{ background: node.attrs.background ? `var(--app-note-${node.attrs.background})` : undefined }} onKeyDown={history}>
    <WidgetHeader icon={<Network size={14} />} label={t("widgetTypes.ipblock")} background={node.attrs.background}
      onBackgroundChange={(background) => updateAttributes({ background })} selectLabel={t("editor.ipBlock.select")}
      onSelect={() => { const position = getPos(); if (position !== undefined) editor.chain().focus().setNodeSelection(position).run(); }}>
      <input data-testid="ipblock-title" aria-label={t("editor.ipBlock.title")} placeholder={t("editor.ipBlock.title")}
        value={String(node.attrs.title)} spellCheck={false} onChange={(event) => updateAttributes({ title: event.target.value, html: null })}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); gateway.current?.focus(); } }} />
    </WidgetHeader>
    <div className="htnote-ipblock-editor-fields">
      <label>{t("editor.ipBlock.gateway")}<input ref={gateway} data-testid="ipblock-gateway" value={String(node.attrs.gateway)}
        placeholder={t("ipBlock.placeholder")} spellCheck={false} aria-invalid={!!result.error && result.error !== "empty"} aria-describedby={result.error && result.error !== "empty" ? `${id}-error` : `${id}-help`}
        onChange={(event) => { markPreviewChanged(); updateAttributes({ gateway: event.target.value, html: null }); }}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.nativeEvent.isComposing) return;
          if (event.key === "Enter") { event.preventDefault(); prefix.current?.focus(); return; }
          const field = event.currentTarget;
          const direction = textBoxBoundary(event.key, field.value, field.selectionStart ?? 0, field.selectionEnd ?? 0);
          const position = getPos();
          if (direction && position !== undefined) { event.preventDefault(); leaveTextBox(editor, position, node.nodeSize, direction); }
        }} /></label>
      <label>{t("editor.ipBlock.prefix")}<select ref={prefix} data-testid="ipblock-prefix" value={Number(node.attrs.prefix)}
        onChange={(event) => { markPreviewChanged(); updateAttributes({ prefix: Number(event.target.value), html: null }); }}>
        {IP_PREFIXES.map((value) => <option key={value} value={value}>{`/${value}`}</option>)}
      </select></label>
    </div>
    <p id={`${id}-help`} className="htnote-ipblock-editor-help"><Info size={14} aria-hidden />{t("editor.ipBlock.help")}</p>
    <div ref={previewRef} className="htnote-ipblock-editor-preview">
      <div className="htnote-ipblock-editor-preview-header"><span><Eye size={14} aria-hidden />{t("editor.ipBlock.preview")}</span>
        <span data-testid="ipblock-count">{t("ipBlock.count", { count: result.hosts.length, formattedCount: count })}</span></div>
      {result.error === "empty" ? <p className="htnote-ipblock-empty">{t("ipBlock.empty")}</p> : result.error ? <p id={`${id}-error`} className="htnote-ipblock-error" role="status">{t(`ipBlock.${result.error}`)}</p> : <>
        <pre data-testid="ipblock-preview">{result.hosts.slice(0, 5).join("\n")}</pre>
        {result.hosts.length > 5 && <p>{t("editor.ipBlock.more", { count: result.hosts.length - 5 })}</p>}
      </>}
    </div>
  </NodeViewWrapper>;
}
