import { escapeTextBoxText } from "./textBox";
import { readWidgetRoot, exactWidgetElement as exact, widgetChildren as children, widgetText as text, singleLineWidgetText } from "./widgets/widgetFormat";
import { readWidgetBackground, serializeWidgetBackground, WIDGET_BACKGROUND_ATTRIBUTE, type WidgetBackground } from "./widgets/widgetBackground";

export interface CopyField { label: string; value: string }
export interface CopyFieldsAttributes { title: string; fields: CopyField[]; html: string | null; background?: WidgetBackground }

export function readCopyFields(html: string): CopyFieldsAttributes | null {
  const box = readWidgetRoot(html);
  if (!box) return null;
  const background = readWidgetBackground(box.attrs.find(({ name }) => name === WIDGET_BACKGROUND_ATTRIBUTE)?.value);
  if (background === null || !exact(box, "div", { class: "htnote-copyfields", "data-htnote-widget": "copyfields", ...(background ? { [WIDGET_BACKGROUND_ATTRIBUTE]: background } : {}) })) return null;
  const [title, list, extra] = children(box);
  if (extra || !exact(title, "div", { class: "htnote-copyfields-title" }) || !exact(list, "dl", { class: "htnote-copyfields-list" }) || title.childNodes.some((node) => node.nodeName !== "#text")) return null;
  const fields: CopyField[] = [];
  for (const row of children(list)) {
    if (!exact(row, "div", { class: "htnote-copyfields-row" })) return null;
    const [label, value, extraField] = children(row);
    if (extraField || !exact(label, "dt", {}) || !exact(value, "dd", {}) ||
      [...label.childNodes, ...value.childNodes].some((node) => node.nodeName !== "#text") || /[\r\n]/.test(text(label) + text(value))) return null;
    fields.push({ label: text(label), value: text(value) });
  }
  return { title: text(title), fields, html, background };
}

export function serializeCopyFields({ title, fields, html, background = "" }: CopyFieldsAttributes): string {
  const original = html === null ? null : readCopyFields(html);
  if (original && original.title === title && original.background === background && JSON.stringify(original.fields) === JSON.stringify(fields)) return html!;
  fields = fields.filter(({ label, value }) => label.trim() || value.trim());
  return `<div class="htnote-copyfields" data-htnote-widget="copyfields"${serializeWidgetBackground(background)}><div class="htnote-copyfields-title">${escapeTextBoxText(title)}</div><dl class="htnote-copyfields-list">${fields.map((field) => `<div class="htnote-copyfields-row"><dt>${escapeTextBoxText(singleLineWidgetText(field.label))}</dt><dd>${escapeTextBoxText(singleLineWidgetText(field.value))}</dd></div>`).join("")}</dl></div>`;
}
