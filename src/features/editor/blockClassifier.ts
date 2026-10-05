import { parseFragment } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";
import { readCopyFields } from "./copyFields";
import { readChecklist } from "./checklist";
import { readCalc } from "./calc";
import { readTemplate } from "./template";
import { readTextBox } from "./textBox";

type Node = DefaultTreeAdapterTypes.ChildNode;
type Element = DefaultTreeAdapterTypes.Element;

export const SUPPORTED_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
  "blockquote", "pre", "code", "table", "thead", "tbody", "tfoot",
  "tr", "th", "td", "caption", "colgroup", "col", "hr", "br",
  "strong", "em", "u", "s", "a", "img", "audio", "video", "source", "span",
]);

export const GLOBAL_ATTRS = new Set(["class", "id", "style", "title"]);

export const TAG_ATTRS: Readonly<Record<string, ReadonlySet<string>>> = {
  a: new Set(["href", "target", "rel", "download"]),
  img: new Set(["src", "alt", "width", "height", "loading"]),
  audio: new Set(["src", "controls", "autoplay", "loop", "muted", "preload"]),
  video: new Set(["src", "controls", "autoplay", "loop", "muted", "preload", "poster", "width", "height"]),
  source: new Set(["src", "type", "media", "srcset", "sizes"]),
  ol: new Set(["start", "reversed", "type"]),
  li: new Set(["value"]),
  td: new Set(["colspan", "rowspan", "headers"]),
  th: new Set(["colspan", "rowspan", "headers", "scope"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
};

export const SUPPORTED = { tags: SUPPORTED_TAGS, globalAttrs: GLOBAL_ATTRS, tagAttrs: TAG_ATTRS };

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

export function isSupportedElement(element: Element): boolean {
  if (element.namespaceURI !== "http://www.w3.org/1999/xhtml" || !SUPPORTED_TAGS.has(element.tagName)) {
    return false;
  }
  return element.attrs.every(({ name, value }) => {
    if (name.startsWith("on")) return false;
    if (name === "href" && value.toLowerCase().replace(/\s/g, "").startsWith("javascript:")) return false;
    return GLOBAL_ATTRS.has(name) || name.startsWith("data-") && name.length > 5 ||
      TAG_ATTRS[element.tagName]?.has(name) === true;
  });
}

function isSupportedTree(node: Node): boolean {
  if (node.nodeName === "#text") return true;
  if (!isElement(node) || !isSupportedElement(node)) return false;
  const location = node.sourceCodeLocation;
  // Eksik kapanış etiketli öğeyi TipTap'e vermek kaynak metni değiştirebilir.
  if (!location || (!new Set(["br", "hr", "img", "col", "source"]).has(node.tagName) && !location.endTag)) return false;
  return node.childNodes.every(isSupportedTree);
}

export type ClassifiedBlock = { kind: "rich" | "raw" | "textBox" | "checklist" | "copyfields" | "template" | "calc"; html: string };

export function classifyTopLevel(innerHtml: string): ClassifiedBlock[] {
  const fragment = parseFragment(innerHtml, { sourceCodeLocationInfo: true });
  const blocks: ClassifiedBlock[] = [];
  let cursor = 0;

  function addRaw(html: string): void {
    if (html.trim()) blocks.push({ kind: "raw", html });
  }

  for (const node of fragment.childNodes) {
    const location = node.sourceCodeLocation;
    if (!location || location.startOffset < cursor || location.endOffset > innerHtml.length) {
      // Ayrıştırıcı kaynak konumunu veremiyorsa tamamını ham olarak koru.
      return innerHtml.trim() ? [{ kind: "raw", html: innerHtml }] : [];
    }
    addRaw(innerHtml.slice(cursor, location.startOffset));
    const html = innerHtml.slice(location.startOffset, location.endOffset);
    if (html.trim()) {
      blocks.push({ kind: readCalc(html) ? "calc" : readTemplate(html) ? "template" : readTextBox(html) ? "textBox" : readChecklist(html) ? "checklist" : readCopyFields(html) ? "copyfields" : isElement(node) && isSupportedTree(node) ? "rich" : "raw", html });
    }
    cursor = location.endOffset;
  }
  addRaw(innerHtml.slice(cursor));
  return blocks;
}
