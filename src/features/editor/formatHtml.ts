import { parse, parseFragment } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";

type Node = DefaultTreeAdapterTypes.Node;

const BLOCK_TAGS = new Set([
  "html", "head", "body", "main", "section", "article", "header", "footer", "aside", "nav",
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "div",
  "pre", "textarea", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "figure", "figcaption", "img", "video", "audio", "source", "hr",
  "title", "meta", "link", "script", "style", "htnote-raw",
]);
const VERBATIM_TAGS = new Set(["pre", "textarea", "code", "script", "style", "htnote-raw"]);
const isWhitespace = (text: string) => /^[\t\n\f\r ]*$/.test(text);

// Kaynak dilimleri kullanılır: etiketler, öznitelikler, entity'ler ve metin yeniden serialize edilmez.
export function formatHtml(source: string, indent = 0): string {
  const options = { sourceCodeLocationInfo: true } as const;
  const tree = /^\s*(?:<!doctype\b|<(?:html|head|body)\b)/i.test(source)
    ? parse(source, options) : parseFragment(source, options);

  function locatedChildren(node: Node): Node[] {
    if (!("childNodes" in node)) return [];
    return node.childNodes.flatMap((child) => child.sourceCodeLocation ? [child] : locatedChildren(child));
  }

  function layout(nodes: Node[], start: number, end: number, depth: number): string | null {
    const blocks = nodes.filter((node) => node.nodeName !== "#text" ||
      !isWhitespace(source.slice(node.sourceCodeLocation!.startOffset, node.sourceCodeLocation!.endOffset)));
    if (!blocks.length || blocks.some((node) => "tagName" in node
      ? !BLOCK_TAGS.has(node.tagName) : node.nodeName !== "#comment" && node.nodeName !== "#documentType")) return null;
    let cursor = start;
    for (const node of blocks) {
      const location = node.sourceCodeLocation!;
      // Hatalı HTML'deki taşınmış/sentetik öğeler kaynak sırasını değiştiremez.
      if (location.startOffset < cursor || location.endOffset > end ||
          !isWhitespace(source.slice(cursor, location.startOffset))) return null;
      cursor = location.endOffset;
    }
    if (!isWhitespace(source.slice(cursor, end))) return null;
    return blocks.map((node) => "  ".repeat(depth) + render(node, depth)).join("\n");
  }

  function render(node: Node, depth: number): string {
    const location = node.sourceCodeLocation!;
    const original = source.slice(location.startOffset, location.endOffset);
    if (!("tagName" in node) || VERBATIM_TAGS.has(node.tagName) ||
        node.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
        node.attrs.some(({ name, value }) => name === "style" && /white-space\s*:/i.test(value))) return original;
    const start = node.sourceCodeLocation?.startTag?.endOffset;
    const end = node.sourceCodeLocation?.endTag?.startOffset;
    if (start === undefined || end === undefined || end < start) return original;
    const inner = layout(locatedChildren(node), start, end, depth + 1);
    if (inner === null) return original;
    return source.slice(location.startOffset, start) + "\n" + inner + "\n" +
      "  ".repeat(depth) + source.slice(end, location.endOffset);
  }

  return layout(locatedChildren(tree), 0, source.length, indent) ?? source;
}
