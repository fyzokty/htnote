import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
export function HtmlBlockView({ node, extension }: NodeViewProps) {
  const { t } = useTranslation();
  const html = String(node.attrs.html ?? "");
  const preview = html.split(/\r\n|\r|\n/).slice(0, 5).join("\n");
  const onEditInCode = extension.options.onEditInCode as (() => void) | undefined;

  return (
    <NodeViewWrapper className="htnote-html-block" draggable="false" contentEditable={false}>
      <div>{t("editor.htmlBlock.label")}</div>
      <pre>{preview}</pre>
      <Button size="sm" type="button" onClick={() => onEditInCode?.()}>{t("editor.htmlBlock.editInCode")}</Button>
    </NodeViewWrapper>
  );
}
