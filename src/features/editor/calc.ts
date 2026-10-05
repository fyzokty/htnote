import "@/bridge/calcEngine.js";
import { readTextareaWidget, serializeTextareaWidget, type TextBoxAttributes } from "./textBox";

export type CalcAttributes = TextBoxAttributes;
export const evaluateCalc = globalThis.HTNOTE_CALC_ENGINE.evaluateCalc;
export const readCalc = (html: string): CalcAttributes | null => readTextareaWidget(html, "calc", "input");
export const serializeCalc = (attrs: CalcAttributes): string => serializeTextareaWidget(attrs, "calc", "input");
