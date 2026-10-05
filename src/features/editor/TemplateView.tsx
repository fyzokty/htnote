import type { NodeViewProps } from "@tiptap/react";
import { TextareaWidgetView } from "./widgets/TextareaWidgetView";

export function TemplateView(props: NodeViewProps) {
  return <TextareaWidgetView {...props} kind="template" />;
}
