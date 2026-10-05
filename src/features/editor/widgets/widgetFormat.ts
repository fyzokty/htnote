import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";

export type WidgetElement = DefaultTreeAdapterTypes.Element;
type Child = DefaultTreeAdapterTypes.ChildNode;

// Onarılmış HTML ve yinelenen öznitelikler widget olarak kabul edilmez.
export function readWidgetRoot(html: string): WidgetElement | null {
  if (!/^<div[\s>]/i.test(html)) return null;
  let invalid = false;
  const fragment = parseFragment(html, { sourceCodeLocationInfo: true, onParseError: ({ code }) => { if (code !== "control-character-reference") invalid = true; } });
  const root = fragment.childNodes[0];
  return !invalid && fragment.childNodes.length === 1 && root && "tagName" in root ? root : null;
}

export function exactWidgetElement(node: Child | undefined, tag: string, attrs: Record<string, string>): node is WidgetElement {
  if (!node || !("tagName" in node) || node.tagName !== tag || node.namespaceURI !== "http://www.w3.org/1999/xhtml") return false;
  const location = node.sourceCodeLocation;
  return !!location?.startTag && (tag === "input" || !!location.endTag) &&
    node.attrs.length === Object.keys(attrs).length && node.attrs.every(({ name, value }) => attrs[name] === value);
}

export const widgetChildren = (element: WidgetElement) => element.childNodes.filter((child) => child.nodeName !== "#text" || !("value" in child) || child.value.trim());
export const widgetText = (element: WidgetElement) => element.childNodes.map((child) => "value" in child ? child.value : "").join("");
export const singleLineWidgetText = (value: string) => value.replace(/\r\n|[\r\n]/g, " ");
