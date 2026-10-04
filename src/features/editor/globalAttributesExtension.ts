import { Extension } from "@tiptap/core";

const TYPES = [
  "paragraph", "heading", "blockquote", "codeBlock", "horizontalRule", "bulletList", "orderedList",
  "listItem", "table", "tableRow", "tableCell", "tableHeader", "bold", "italic", "underline",
  "strike", "link", "code", "image", "audio", "video", "hardBreak", "textStyle",
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
          style: { default: null, parseHTML: (element) => {
            if (element.tagName !== "SPAN") return element.getAttribute("style");
            const preserved = element.style.cssText;
            element = element.cloneNode() as HTMLElement;
            element.style.cssText = preserved;
            ["color", "font-family", "font-size"].forEach((name) => element.style.removeProperty(name));
            const style = element.style.cssText;
            return style || null;
          } },
          title: { default: null },
          dataAttributes: {
            default: null,
            parseHTML: (element) => Object.fromEntries(
              Array.from(element.attributes).filter((attr) => attr.name.startsWith("data-") && attr.name.length > 5 &&
                !(attr.name === "data-align" && ["IMG", "AUDIO", "VIDEO"].includes(element.tagName)))
                .map((attr) => [attr.name, attr.value]),
            ),
            renderHTML: (attributes) => attributes.dataAttributes ?? {},
          },
        },
      },
    ];
  },
});
