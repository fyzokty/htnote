import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";

import { GlobalAttributes } from "@/features/editor/globalAttributesExtension";
import { HtmlBlock } from "@/features/editor/htmlBlockNode";
import { Checklist } from "./checklistNode";
import { TextBox } from "./textBoxNode";
import { Audio, Image, InsertMedia, Video } from "@/features/editor/mediaNodes";
import { MediaSelection } from "@/features/editor/mediaSelection";
import { NoteLinkDecorations, noteLinkShortcut } from "@/features/editor/noteLinks";

export function createVisualExtensions(placeholder: string, onEditInCode?: () => void, onLinkNote?: () => void, noteId = "") {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, protocols: ["htnote"] },
      trailingNode: false,
      dropcursor: { color: false, width: 2, class: "htnote-drop-cursor" },
    }),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder }),
    TextStyle.configure({ mergeNestedSpanStyles: false }),
    Color,
    FontFamily,
    FontSize,
    GlobalAttributes,
    Image.configure({ noteId }),
    Audio.configure({ noteId }),
    Video.configure({ noteId }),
    InsertMedia,
    MediaSelection,
    HtmlBlock.configure({ onEditInCode }),
    TextBox,
    Checklist,
    NoteLinkDecorations,
    ...(onLinkNote ? [noteLinkShortcut(onLinkNote)] : []),
  ];
}
