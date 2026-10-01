import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";

import { GlobalAttributes } from "@/features/editor/globalAttributesExtension";
import { HtmlBlock } from "@/features/editor/htmlBlockNode";

export function createVisualExtensions(placeholder: string, onEditInCode?: () => void) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true },
      trailingNode: false,
    }),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder }),
    GlobalAttributes,
    HtmlBlock.configure({ onEditInCode }),
  ];
}
