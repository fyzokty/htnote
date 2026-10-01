import { parse } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";

export type ExtractResult =
  | { ok: true; inner: string; before: string; after: string }
  | { ok: false; reason: "NO_MAIN" | "MULTIPLE_MAIN" | "MALFORMED_MAIN" };

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

export function extractContent(html: string): ExtractResult {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const matches: Element[] = [];

  function visit(node: Node): void {
    if (isElement(node) && node.tagName === "main" &&
        node.attrs.some((attr) => attr.name === "id" && attr.value === "htnote-content")) {
      matches.push(node);
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }

  visit(document);
  if (matches.length === 0) return { ok: false, reason: "NO_MAIN" };
  if (matches.length > 1) return { ok: false, reason: "MULTIPLE_MAIN" };

  const location = matches[0].sourceCodeLocation;
  const start = location?.startTag?.endOffset;
  const end = location?.endTag?.startOffset;
  // Sentetik kapanış etiketi veya geçersiz ofset veri kaybına yol açabilir.
  if (start === undefined || end === undefined || end < start) {
    return { ok: false, reason: "MALFORMED_MAIN" };
  }

  return {
    ok: true,
    inner: html.slice(start, end),
    before: html.slice(0, start),
    after: html.slice(end),
  };
}

export function replaceContent(parts: Extract<ExtractResult, { ok: true }>, newInner: string): string {
  return parts.before + newInner + parts.after;
}
