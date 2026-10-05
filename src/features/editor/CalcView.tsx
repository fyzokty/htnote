import type { NodeViewProps } from "@tiptap/react";
import { TextareaWidgetView } from "./widgets/TextareaWidgetView";

export function CalcView(props: NodeViewProps) {
  return <TextareaWidgetView {...props} kind="calc" />;
}
