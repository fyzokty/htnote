import "@/bridge/templateEngine.js";
import { readTextareaWidget, serializeTextareaWidget, type TextBoxAttributes } from "./textBox";

export type TemplateAttributes = TextBoxAttributes;
export const parseTemplate = globalThis.HTNOTE_TEMPLATE_ENGINE.parseTemplate;
export const readTemplate = (html: string): TemplateAttributes | null => readTextareaWidget(html, "template", "source");
export const serializeTemplate = (attrs: TemplateAttributes): string => serializeTextareaWidget(attrs, "template", "source");
