import { readWidgetRoot, exactWidgetElement as exact, widgetChildren as children, widgetText as text, singleLineWidgetText } from "./widgets/widgetFormat";
import { escapeTextBoxText } from "./textBox";
import { readWidgetBackground, serializeWidgetBackground, WIDGET_BACKGROUND_ATTRIBUTE, type WidgetBackground } from "./widgets/widgetBackground";

export interface StepImage { src: string; alt: string }
export interface StepItem { heading: string; text: string; code: string | null; image: StepImage | null }
export interface StepsAttributes { title: string; items: StepItem[]; html: string | null; background?: WidgetBackground }
export const emptyStep = (): StepItem => ({ heading: "", text: "", code: null, image: null });
export const isEmptyStep = (item: StepItem) => !item.heading.trim() && !item.text.trim() && !item.code?.trim() && !item.image;

export function isStepImageSrc(src: string): boolean {
  try {
    const path = decodeURIComponent(src);
    return /^(?:\.\/)?assets\/.+/.test(path) && !/[\\:?#]/.test(path) && !Array.from(path).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) &&
      path.replace(/^\.\//, "").split("/").every((part) => part !== "" && part !== "." && part !== "..");
  } catch { return false; }
}

export function readSteps(html: string): StepsAttributes | null {
  const box = readWidgetRoot(html);
  if (!box) return null;
  const background = readWidgetBackground(box.attrs.find(({ name }) => name === WIDGET_BACKGROUND_ATTRIBUTE)?.value);
  if (background === null || !exact(box, "div", { class: "htnote-steps", "data-htnote-widget": "steps", ...(background ? { [WIDGET_BACKGROUND_ATTRIBUTE]: background } : {}) })) return null;
  const [title, list, extra] = children(box);
  const plain = (element: { childNodes: { nodeName: string }[] }) => element.childNodes.every((node) => node.nodeName === "#text");
  if (extra || !exact(title, "div", { class: "htnote-steps-title" }) || !plain(title) || !exact(list, "ol", { class: "htnote-steps-list" })) return null;
  const items: StepItem[] = [];
  for (const row of children(list)) {
    if (!exact(row, "li", { class: "htnote-steps-item" })) return null;
    const [heading, description, ...optional] = children(row);
    if (!exact(heading, "div", { class: "htnote-steps-heading" }) || !plain(heading) || /[\r\n]/.test(text(heading)) ||
      !exact(description, "div", { class: "htnote-steps-text" }) || !plain(description)) return null;
    let code: string | null = null;
    let image: StepImage | null = null;
    if (optional[0] && exact(optional[0], "pre", { class: "htnote-steps-code" })) {
      const element = optional.shift()!;
      if (!("tagName" in element) || !plain(element)) return null;
      code = text(element);
    }
    if (optional[0] && "attrs" in optional[0]) {
      const element = optional[0];
      const src = element.attrs.find(({ name }) => name === "src")?.value;
      const alt = element.attrs.find(({ name }) => name === "alt")?.value;
      if (src === undefined || alt === undefined || !isStepImageSrc(src) || !exact(element, "img", { class: "htnote-steps-image", src, alt })) return null;
      image = { src, alt }; optional.shift();
    }
    if (optional.length) return null;
    items.push({ heading: text(heading), text: text(description), code, image });
  }
  return { title: text(title), items, html, background };
}

export function serializeSteps({ title, items, html, background = "" }: StepsAttributes): string {
  const original = html === null ? null : readSteps(html);
  if (original && original.title === title && original.background === background && JSON.stringify(original.items) === JSON.stringify(items)) return html!;
  const attribute = (value: string) => escapeTextBoxText(value).replace(/"/g, "&quot;");
  return `<div class="htnote-steps" data-htnote-widget="steps"${serializeWidgetBackground(background)}><div class="htnote-steps-title">${escapeTextBoxText(title)}</div><ol class="htnote-steps-list">${items.filter((item) => !isEmptyStep(item)).map((item) =>
    `<li class="htnote-steps-item"><div class="htnote-steps-heading">${escapeTextBoxText(singleLineWidgetText(item.heading))}</div><div class="htnote-steps-text">${escapeTextBoxText(item.text)}</div>${item.code === null ? "" : `<pre class="htnote-steps-code">${item.code.startsWith("\n") ? "\n" : ""}${escapeTextBoxText(item.code)}</pre>`}${item.image && isStepImageSrc(item.image.src) ? `<img class="htnote-steps-image" src="${attribute(item.image.src)}" alt="${attribute(item.image.alt)}">` : ""}</li>`).join("")}</ol></div>`;
}
