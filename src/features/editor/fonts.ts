import type { Editor } from "@tiptap/core";
import { ipc } from "@/lib/ipc";

export const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
let fonts: Promise<string[]> | undefined;
export function loadSystemFonts(): Promise<string[]> {
  return fonts ??= ipc.listSystemFonts().then((names) => { if (!Array.isArray(names) || !names.length) throw new Error("Empty font list"); return names; }).catch(() => ["Arial", "Courier New", "Georgia", "Helvetica", "Times New Roman", "Verdana"]);
}
export function fontStack(family: string): string {
  const safe = family.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n\f]/g, " ");
  return `"${safe}", ${/mono|consolas|courier|menlo|cascadia code|lucida console/i.test(family) ? "monospace" : "sans-serif"}`;
}
export function clampFontSize(value: string): string | null {
  if (!value.trim() || !Number.isFinite(Number(value))) return null;
  return `${Math.max(8, Math.min(96, Math.round(Number(value))))}px`;
}
export function selectedTextStyle(editor: Editor, attribute: "fontFamily" | "fontSize"): string {
  const { from, to, empty } = editor.state.selection;
  if (empty) return (editor.getAttributes("textStyle")[attribute] as string | undefined) ?? "";
  const values = new Set<string>();
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.isText) values.add((node.marks.find((mark) => mark.type.name === "textStyle")?.attrs[attribute] as string | undefined) ?? "");
  });
  return values.size > 1 ? "—" : [...values][0] ?? "";
}
export function familyLabel(value: string): string {
  return value === "—" ? value : value.split(",")[0].trim().replace(/^["']|["']$/g, "");
}

export function selectedComputedStyle(editor: Editor, property: "fontSize" | "color"): string {
  try {
    const { node, offset } = editor.view.domAtPos(editor.state.selection.from);
    // Öğenin içindeki konumda, seçimin başladığı metnin stilini kullan.
    const target = node.nodeType === Node.TEXT_NODE ? node : node.childNodes[offset] ?? node.childNodes[offset - 1] ?? node;
    const element = target.nodeType === Node.ELEMENT_NODE ? target as Element : target.parentElement;
    return element ? getComputedStyle(element)[property] : "";
  } catch { return ""; }
}
