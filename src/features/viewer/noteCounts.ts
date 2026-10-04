import { parse, type DefaultTreeAdapterMap } from "parse5";

export interface NoteCounts { words: number; characters: number }
type Node = DefaultTreeAdapterMap["node"];
const blocks = new Set("address article aside blockquote br dd div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table tbody td th thead tr ul".split(" "));

/** Counts static visible text without executing note HTML or depending on a browser DOM. */
export function countNoteText(html: string): NoteCounts {
  const document = parse(html);
  let body: Node = document;
  let main: Node | null = null;
  const stack: Node[] = [document];
  while (stack.length) {
    const node = stack.pop()!;
    if ("tagName" in node) {
      if (node.tagName === "body") body = node;
      if (node.tagName === "main" && node.attrs.some(({ name, value }) => name === "id" && value === "htnote-content")) main = node;
    }
    if ("childNodes" in node) node.childNodes.forEach((child) => stack.push(child));
  }
  const pieces: string[] = [];
  let boundary = false;
  const pending: (Node | null)[] = [main ?? body];
  while (pending.length) {
    const node = pending.pop();
    if (!node) { boundary = true; continue; }
    if ("tagName" in node && (node.tagName === "script" || node.tagName === "style" || node.tagName === "template" || node.attrs.some(({ name, value }) => name === "hidden" || (name === "style" && /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(value))))) continue;
    const block = "tagName" in node && blocks.has(node.tagName);
    if (block) boundary = true;
    if ("value" in node && node.nodeName === "#text" && node.value) {
      if (boundary && pieces.length && !/\s$/u.test(pieces[pieces.length - 1]) && !/^\s/u.test(node.value)) pieces.push(" ");
      pieces.push(node.value);
      boundary = false;
    }
    if (block) pending.push(null);
    if ("childNodes" in node) for (let index = node.childNodes.length - 1; index >= 0; index--) pending.push(node.childNodes[index]);
  }
  const text = pieces.join("");
  return { words: text.split(/\s+/u).filter((part) => /[\p{L}\p{N}]/u.test(part)).length, characters: Array.from(text.replace(/[\r\n]/g, "")).length };
}
