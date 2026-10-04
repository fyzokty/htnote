import { parseFragment } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

type Element = DefaultTreeAdapterTypes.Element;
export interface TextBoxAttributes { title: string; content: string; html: string | null }

function exactAttributes(element: Element, expected: Record<string, string>): boolean {
  return element.attrs.length === Object.keys(expected).length &&
    element.attrs.every(({ name, value }) => expected[name] === value);
}

export function readTextBox(html: string): TextBoxAttributes | null {
  if (!/^<div[\s>]/i.test(html)) return null;
  let invalid = false;
  const fragment = parseFragment(html, { sourceCodeLocationInfo: true, onParseError: ({ code }) => { if (code !== "control-character-reference") invalid = true; } });
  if (invalid) return null;
  const box = fragment.childNodes[0];
  if (fragment.childNodes.length !== 1 || !box || !("tagName" in box) || box.tagName !== "div" ||
    !exactAttributes(box, { class: "htnote-textbox", "data-htnote-widget": "textbox" })) return null;
  const children = box.childNodes.filter((child) => !("value" in child) || child.value.trim());
  if (children.length !== 2) return null;
  const [title, input] = children;
  if (!("tagName" in title) || title.tagName !== "div" ||
    !exactAttributes(title, { class: "htnote-textbox-title" }) ||
    !("tagName" in input) || input.tagName !== "textarea" ||
    !exactAttributes(input, { class: "htnote-textbox-input", spellcheck: "false", rows: "3" })) return null;
  // Onarılmış/eksik etiketler ve yinelenmiş öznitelikler ham HTML olarak kalır.
  for (const element of [box, title, input]) {
    const location = element.sourceCodeLocation;
    if (!location?.startTag || !location.endTag ||
      (html.slice(location.startTag.startOffset, location.startTag.endOffset).match(/\s+[\w-]+\s*=/g)?.length ?? 0) !== element.attrs.length)
      return null;
  }
  if (title.childNodes.some((child) => child.nodeName !== "#text") || input.childNodes.some((child) => child.nodeName !== "#text")) return null;
  const text = (element: Element) => element.childNodes.map((child) => "value" in child ? child.value : "").join("");
  return { title: text(title), content: text(input), html };
}

export function escapeTextBoxText(value: string): string {
  // İlk satır sonu textarea ayrıştırılırken atılmasın; CR de normalize edilmesin.
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#13;").replace(/^\n/, "&#10;");
}

export function serializeTextBox({ title, content, html }: TextBoxAttributes): string {
  const original = html === null ? null : readTextBox(html);
  if (original && original.title === title && original.content === content) return html!;
  // Boş başlık da daima yazılır; biçim tek ve öngörülebilirdir.
  return `<div class="htnote-textbox" data-htnote-widget="textbox"><div class="htnote-textbox-title">${escapeTextBoxText(title)}</div><textarea class="htnote-textbox-input" spellcheck="false" rows="3">${content.startsWith("\n") ? "\n" : ""}${escapeTextBoxText(content)}</textarea></div>`;
}

export function leaveTextBox(editor: Editor, position: number, size: number, direction: -1 | 1): void {
  let transaction = editor.state.tr;
  const boundary = direction === -1 ? position : position + size;
  const adjacent = direction === -1 ? transaction.doc.resolve(boundary).nodeBefore : transaction.doc.resolve(boundary).nodeAfter;
  if (!adjacent || !adjacent.isTextblock) transaction = transaction.insert(boundary, editor.schema.nodes.paragraph.create());
  const target = direction === -1 && adjacent?.isTextblock ? boundary - 1 : boundary + 1;
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(target), direction));
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
}

export function textBoxBoundary(key: string, value: string, start: number, end: number): -1 | 1 | null {
  if (start !== end) return null;
  if (key === "ArrowUp" && start === 0) return -1;
  if (key === "ArrowDown" && end === value.length) return 1;
  return null;
}
