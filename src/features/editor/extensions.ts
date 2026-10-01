import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";

import { GlobalAttributes } from "@/features/editor/globalAttributesExtension";
import { HtmlBlock } from "@/features/editor/htmlBlockNode";
import { Audio, Image, InsertMedia, Video } from "@/features/editor/mediaNodes";
import { NoteLinkDecorations, noteLinkShortcut } from "@/features/editor/noteLinks";

export function createVisualExtensions(placeholder: string, onEditInCode?: () => void, onLinkNote?: () => void, noteId = "") {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, protocols: ["htnote"] },
      trailingNode: false,
    }),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder }),
    GlobalAttributes,
    Image.configure({ noteId }),
    Audio.configure({ noteId }),
    Video.configure({ noteId }),
    InsertMedia,
    HtmlBlock.configure({ onEditInCode }),
    NoteLinkDecorations,
    ...(onLinkNote ? [noteLinkShortcut(onLinkNote)] : []),
  ];
}
