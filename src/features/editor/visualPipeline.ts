import { parseFragment } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";

import { classifyTopLevel } from "@/features/editor/blockClassifier";
import { extractContent, replaceContent } from "@/features/editor/contentRegion";
import type { ExtractResult } from "@/features/editor/contentRegion";
import { formatHtml } from "@/features/editor/formatHtml";
import { readTextBox, serializeTextBox } from "./textBox";
import type { TextBoxAttributes } from "./textBox";

type Parts = Extract<ExtractResult, { ok: true }>;
type Element = DefaultTreeAdapterTypes.Element;

const VISUAL_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
  "pre", "code", "table", "thead", "tbody", "tr", "th", "td", "hr", "br",
  "strong", "em", "u", "s", "a", "span", "img", "audio", "video", "source",
]);

function supportedByVisualEditor(html: string): boolean {
  const fragment = parseFragment(html);
  function hasSpan(node: DefaultTreeAdapterTypes.Node): boolean {
    return "tagName" in node && node.tagName === "span" || "childNodes" in node && node.childNodes.some(hasSpan);
  }
  if (fragment.childNodes.some((node) => "tagName" in node && node.tagName === "span")) return false;
  function visit(node: DefaultTreeAdapterTypes.Node): boolean {
    if ("tagName" in node && !VISUAL_TAGS.has(node.tagName)) return false;
    // Attribute-only spans and overlapping spans remain lossless raw HTML blocks.
    if ("tagName" in node && node.tagName === "span" && (!node.attrs.some((attr) => attr.name === "style") || node.childNodes.some(hasSpan))) return false;
    return !("childNodes" in node) || node.childNodes.every(visit);
  }
  return fragment.childNodes.every(visit);
}

function escapeAttribute(value: string): string {
  return value.replace(/[&"<>]/g, (character) => `&#${character.charCodeAt(0)};`);
}

export function wrapRawBlocks(inner: string): string {
  const blocks = classifyTopLevel(inner);
  return blocks.map(({ kind, html }) => kind === "textBox"
    ? `<htnote-textbox-node data-box="${escapeAttribute(JSON.stringify(readTextBox(html)))}"></htnote-textbox-node>` :
    // JSON kaçışları satır sonlarının HTML ayrıştırıcısında normalize edilmesini önler.
    kind === "raw" || !supportedByVisualEditor(html)
      ? `<htnote-raw data-html="${escapeAttribute(JSON.stringify(html))}"></htnote-raw>` : html,
  ).join("") + (blocks[blocks.length - 1]?.kind === "textBox" ? "<p></p>" : "");
}

export function unwrapRawBlocks(editorHtml: string): string {
  const fragment = parseFragment(editorHtml, { sourceCodeLocationInfo: true });
  const replacements: { start: number; end: number; html: string }[] = [];

  function visit(node: DefaultTreeAdapterTypes.Node): void {
    if ("tagName" in node) {
      const element = node as Element;
      if (element.tagName === "htnote-textbox-node") {
        const location = element.sourceCodeLocation;
        const data = element.attrs.find((attr) => attr.name === "data-box")?.value;
        if (location && data) {
          replacements.push({ start: location.startOffset, end: location.endOffset, html: serializeTextBox(JSON.parse(data) as TextBoxAttributes) });
          return;
        }
      }
      if (element.tagName === "htnote-raw") {
        const location = element.sourceCodeLocation;
        const html = element.attrs.find((attr) => attr.name === "data-html")?.value;
        if (location && html !== undefined) {
          replacements.push({ start: location.startOffset, end: location.endOffset, html: JSON.parse(html) as string });
          return;
        }
      }
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }

  fragment.childNodes.forEach(visit);
  let result = editorHtml;
  for (const replacement of replacements.reverse()) {
    result = result.slice(0, replacement.start) + replacement.html + result.slice(replacement.end);
  }
  return result;
}

export type VisualLoadResult = ExtractResult extends infer R
  ? R extends { ok: true } ? R & { editorHtml: string } : R
  : never;

export function loadForVisual(fullHtml: string): VisualLoadResult {
  const parts = extractContent(fullHtml);
  if (!parts.ok) return parts;
  return { ...parts, editorHtml: wrapRawBlocks(parts.inner) };
}

export function saveFromVisual(parts: Parts, editorHtml: string): string {
  return replaceVisualContent(parts, serializeVisualHtml(editorHtml, visualContentIndent(parts)));
}

export function visualContentIndent(parts: Parts): number {
  return Math.ceil(mainIndent(parts).replace(/\t/g, "  ").length / 2) + 1;
}

function mainIndent(parts: Parts): string {
  return parts.before.slice(parts.before.lastIndexOf("\n") + 1).match(/^[ \t]*/)?.[0] ?? "";
}

export function serializeVisualHtml(editorHtml: string, indent = 0): string {
  // Ham blokları biçimlendirme sonrasında açarak D10'daki birebir korumayı sürdür.
  return unwrapRawBlocks(formatHtml(editorHtml, indent));
}

export function replaceVisualContent(parts: Parts, inner: string): string {
  return replaceContent(parts, `\n${inner}\n${mainIndent(parts)}`);
}
