import "@/bridge/ipEngine.js";
import { escapeTextBoxText } from "./textBox";
import { readWidgetRoot, exactWidgetElement as exact, widgetChildren as children, widgetText as text } from "./widgets/widgetFormat";
import { readWidgetBackground, serializeWidgetBackground, WIDGET_BACKGROUND_ATTRIBUTE, type WidgetBackground } from "./widgets/widgetBackground";

export interface IpBlockAttributes { title: string; gateway: string; prefix: number; html: string | null; background?: WidgetBackground }
export const calculateIpBlock = globalThis.HTNOTE_IP_ENGINE.calculateIpBlock;
export const IP_PREFIXES = [24, 25, 26, 27, 28, 29, 30] as const;

export function readIpBlock(html: string): IpBlockAttributes | null {
  const box = readWidgetRoot(html);
  if (!box) return null;
  const background = readWidgetBackground(box.attrs.find(({ name }) => name === WIDGET_BACKGROUND_ATTRIBUTE)?.value);
  const gateway = box.attrs.find(({ name }) => name === "data-htnote-gw")?.value;
  const prefixText = box.attrs.find(({ name }) => name === "data-htnote-prefix")?.value;
  if (background === null || gateway === undefined || !prefixText || !/^2[4-9]$|^30$/.test(prefixText) ||
    !exact(box, "div", { class: "htnote-ipblock", "data-htnote-widget": "ipblock", "data-htnote-gw": gateway, "data-htnote-prefix": prefixText, ...(background ? { [WIDGET_BACKGROUND_ATTRIBUTE]: background } : {}) })) return null;
  const [title, list, extra] = children(box);
  if (extra || !exact(title, "div", { class: "htnote-ipblock-title" }) || !exact(list, "pre", { class: "htnote-ipblock-list" }) ||
    [...title.childNodes, ...list.childNodes].some((node) => node.nodeName !== "#text")) return null;
  const prefix = Number(prefixText);
  if (text(list) !== calculateIpBlock(gateway, prefix).hosts.join("\n")) return null;
  return { title: text(title), gateway, prefix, html, background };
}

export function serializeIpBlock({ title, gateway, prefix, html, background = "" }: IpBlockAttributes): string {
  const original = html === null ? null : readIpBlock(html);
  if (original && original.title === title && original.gateway === gateway && original.prefix === prefix && original.background === background) return html!;
  const list = calculateIpBlock(gateway, prefix).hosts.join("\n");
  return `<div class="htnote-ipblock" data-htnote-widget="ipblock" data-htnote-gw="${escapeTextBoxText(gateway).replace(/"/g, "&quot;")}" data-htnote-prefix="${prefix}"${serializeWidgetBackground(background)}><div class="htnote-ipblock-title">${escapeTextBoxText(title)}</div><pre class="htnote-ipblock-list">${list}</pre></div>`;
}
