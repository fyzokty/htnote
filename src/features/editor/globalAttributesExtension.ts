import { Extension } from "@tiptap/core";

const TYPES = [
  "paragraph", "heading", "blockquote", "codeBlock", "horizontalRule", "bulletList", "orderedList",
  "listItem", "table", "tableRow", "tableCell", "tableHeader", "bold", "italic", "underline",
  "strike", "link", "code", "image", "audio", "video", "hardBreak",
];

export const GlobalAttributes = Extension.create({
  name: "htnoteGlobalAttributes",
  addGlobalAttributes() {
    return [
      {
        types: TYPES,
        attributes: {
          class: { default: null },
          id: { default: null },
          style: { default: null },
          title: { default: null },
          dataAttributes: {
            default: {},
            parseHTML: (element) => Object.fromEntries(
              Array.from(element.attributes).filter((attr) => attr.name.startsWith("data-") && attr.name.length > 5)
                .map((attr) => [attr.name, attr.value]),
            ),
            renderHTML: (attributes) => attributes.dataAttributes ?? {},
          },
        },
      },
    ];
  },
});
