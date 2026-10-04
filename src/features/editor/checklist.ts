import { parseFragment } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";
import { escapeTextBoxText } from "./textBox";
import { readWidgetBackground, serializeWidgetBackground, WIDGET_BACKGROUND_ATTRIBUTE, type WidgetBackground } from "./widgets/widgetBackground";

type Element = DefaultTreeAdapterTypes.Element;
type Child = DefaultTreeAdapterTypes.ChildNode;
export interface ChecklistItem { text: string; checked: boolean }
export interface ChecklistAttributes { title: string; items: ChecklistItem[]; html: string | null; background?: WidgetBackground }

const children = (element: Element) => element.childNodes.filter((child) => child.nodeName !== "#text" || !("value" in child) || child.value.trim());
const text = (element: Element) => element.childNodes.map((child) => "value" in child ? child.value : "").join("");

export function readChecklist(html: string): ChecklistAttributes | null {
  if (!/^<div[\s>]/i.test(html)) return null;
  let invalid = false;
  const fragment = parseFragment(html, { sourceCodeLocationInfo: true, onParseError: ({ code }) => { if (code !== "control-character-reference") invalid = true; } });
  const exact = (node: Child | undefined, tag: string, attrs: Record<string, string>): node is Element => {
    if (!node || !("tagName" in node) || node.tagName !== tag || node.namespaceURI !== "http://www.w3.org/1999/xhtml") return false;
    const location = node.sourceCodeLocation;
    return !!location?.startTag && (tag === "input" || !!location.endTag) &&
      node.attrs.length === Object.keys(attrs).length && node.attrs.every(({ name, value }) => attrs[name] === value);
  };
  const box = fragment.childNodes[0];
  if (invalid || fragment.childNodes.length !== 1 || !box || !("tagName" in box)) return null;
  const background = readWidgetBackground(box.attrs.find(({ name }) => name === WIDGET_BACKGROUND_ATTRIBUTE)?.value);
  if (background === null || !exact(box, "div", { class: "htnote-checklist", "data-htnote-widget": "checklist", ...(background ? { [WIDGET_BACKGROUND_ATTRIBUTE]: background } : {}) })) return null;
  const [title, list, extra] = children(box);
  if (extra || !exact(title, "div", { class: "htnote-checklist-title" }) || !exact(list, "ul", { class: "htnote-checklist-items" }) || title.childNodes.some((node) => node.nodeName !== "#text")) return null;
  const items: ChecklistItem[] = [];
  for (const row of children(list)) {
    if (!exact(row, "li", {})) return null;
    const [label, extraLabel] = children(row);
    if (extraLabel || !exact(label, "label", {})) return null;
    const [input, ...rest] = label.childNodes;
    const checkedAttr = input && "attrs" in input ? input.attrs.find(({ name }) => name === "checked") : undefined;
    if (checkedAttr && !["", "checked"].includes(checkedAttr.value)) return null;
    if (!exact(input, "input", { type: "checkbox", ...(checkedAttr ? { checked: checkedAttr.value } : {}) }) || rest.some((node) => node.nodeName !== "#text")) return null;
    const value = rest.map((node) => "value" in node ? node.value : "").join("");
    if (!value.startsWith(" ") || /[\r\n]/.test(value)) return null;
    items.push({ text: value.slice(1), checked: !!checkedAttr });
  }
  return { title: text(title), items, html, background };
}

export function serializeChecklist({ title, items, html, background = "" }: ChecklistAttributes): string {
  const original = html === null ? null : readChecklist(html);
  if (original && original.title === title && original.background === background && JSON.stringify(original.items) === JSON.stringify(items)) return html!;
  return `<div class="htnote-checklist" data-htnote-widget="checklist"${serializeWidgetBackground(background)}><div class="htnote-checklist-title">${escapeTextBoxText(title)}</div><ul class="htnote-checklist-items">${items.map((item) => `<li><label><input type="checkbox"${item.checked ? " checked" : ""}> ${escapeTextBoxText(item.text.replace(/[\r\n]+/g, " "))}</label></li>`).join("")}</ul></div>`;
}
