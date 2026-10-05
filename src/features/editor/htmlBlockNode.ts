import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { HtmlBlockView } from "@/features/editor/HtmlBlockView";

export const HtmlBlock = Node.create<{ onEditInCode?: () => void }>({
  name: "htmlBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addOptions() {
    return { onEditInCode: undefined };
  },
  addAttributes() {
    return {
      html: {
        default: "",
        parseHTML: (element) => JSON.parse(element.getAttribute("data-html") ?? '""') as string,
      },
    };
  },
  parseHTML() {
    return [{ tag: "htnote-raw[data-html]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["htnote-raw", mergeAttributes({ "data-html": JSON.stringify(HTMLAttributes.html) },
      Object.fromEntries(Object.entries(HTMLAttributes).filter(([key]) => key !== "html")))];
  },
  addNodeView() {
    return ReactNodeViewRenderer(HtmlBlockView);
  },
});
