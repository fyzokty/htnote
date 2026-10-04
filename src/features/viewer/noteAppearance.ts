import { parse } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";
import type { CSSProperties } from "react";
import { widgetBaseCss, widgetThemeDeclarations } from "@/features/editor/widgets/widgetTheme";

export const NOTE_BACKGROUNDS = ["sepia", "mint", "rose", "sky", "lavender", "charcoal"] as const;
export type NoteBackground = "" | typeof NOTE_BACKGROUNDS[number];

function findElement(html: string, tag: string, id?: string): DefaultTreeAdapterTypes.Element | null {
  const tree = parse(html, { sourceCodeLocationInfo: true });
  function visit(node: DefaultTreeAdapterTypes.Node): DefaultTreeAdapterTypes.Element | null {
    if ("tagName" in node && node.tagName === tag && (!id || node.attrs.some((attr) => attr.name === "id" && attr.value === id))) return node;
    if ("childNodes" in node) for (const child of node.childNodes) { const found = visit(child); if (found) return found; }
    return null;
  }
  return visit(tree);
}

export function readNoteBackground(html: string): NoteBackground {
  const value = findElement(html, "body")?.attrs.find((attr) => attr.name === "data-ht-bg")?.value;
  return NOTE_BACKGROUNDS.includes(value as typeof NOTE_BACKGROUNDS[number]) ? value as NoteBackground : "";
}

export function noteBackgroundStyle(html: string): CSSProperties {
  const preset = readNoteBackground(html);
  return { background: preset ? `var(--app-note-${preset})` : "var(--app-surface)", color: "var(--app-text)" };
}

// Preset renkleri tema token'larından alınır ve taşınabilir çıktıya gömülür.
export function appearanceCss(): string {
  const tokens = getComputedStyle(document.documentElement);
  const text = (mode: "light" | "dark") => {
    const value = tokens.getPropertyValue(`--app-text-${mode}`).trim();
    return /^#[\da-f]{6}$/i.test(value) ? `--ht-text:${value};` : "";
  };
  const colors = (mode: "light" | "dark") => NOTE_BACKGROUNDS.map((preset) => {
    const value = tokens.getPropertyValue(`--app-note-${preset}-${mode}`).trim();
    return /^#[\da-f]{6}$/i.test(value) ? `--ht-note-${preset}:${value};` : "";
  }).join("");
  const palette = (mode: "light" | "dark") => colors(mode) + text(mode) + widgetThemeDeclarations(mode, tokens);
  return `:where(html){${palette("light")}}\n@media(prefers-color-scheme:dark){:where(html:not([data-ht-theme])){${palette("dark")}}}\n:where(html[data-ht-theme="dark"]){${palette("dark")}}\n` +
    NOTE_BACKGROUNDS.map((preset) => `:where(html:has(body[data-ht-bg="${preset}"])){--ht-note-bg:var(--ht-note-${preset});}\n:where(body[data-ht-bg="${preset}"]){--ht-bg:var(--ht-note-${preset});}`).join("\n") +
    '\n:where(html:has(body[data-ht-bg])){background:var(--ht-note-bg,var(--ht-bg));}\n:where(body[data-ht-bg]){background:var(--ht-bg);color:var(--ht-text);}' + widgetBaseCss +
    NOTE_BACKGROUNDS.map((preset) => `\n:where([data-htnote-widget][data-htnote-bg="${preset}"]){background:var(--ht-note-${preset});}`).join("");
}

function hasPresetWidget(html: string): boolean {
  const tree = parse(html);
  function visit(node: DefaultTreeAdapterTypes.Node): boolean {
    if ("tagName" in node && node.attrs.some(({ name }) => name === "data-htnote-widget") &&
      node.attrs.some(({ name, value }) => name === "data-htnote-bg" && NOTE_BACKGROUNDS.includes(value as typeof NOTE_BACKGROUNDS[number]))) return true;
    return "childNodes" in node && node.childNodes.some(visit);
  }
  return visit(tree);
}

export function syncAppearanceStyle(html: string): string {
  const needed = !!readNoteBackground(html) || hasPresetWidget(html);
  const style = findElement(html, "style", "htnote-appearance")?.sourceCodeLocation;
  if (!needed && !style) return html;
  const stylesheet = `<style id="htnote-appearance">${appearanceCss()}</style>`;
  if (needed && style && html.slice(style.startOffset, style.endOffset) === stylesheet) return html;
  const updated = style ? html.slice(0, style.startOffset) + html.slice(style.endOffset) : html;
  if (!needed) return updated;
  const headStart = findElement(updated, "head")?.sourceCodeLocation?.startTag?.endOffset;
  if (headStart === undefined) {
    const bodyStart = findElement(updated, "body")?.sourceCodeLocation?.startOffset ?? 0;
    return updated.slice(0, bodyStart) + stylesheet + updated.slice(bodyStart);
  }
  return updated.slice(0, headStart) + stylesheet + updated.slice(headStart);
}

export function writeNoteBackground(html: string, value: string): string {
  if (value && !NOTE_BACKGROUNDS.includes(value as typeof NOTE_BACKGROUNDS[number])) throw new Error("Invalid note background");
  const body = findElement(html, "body");
  const startTag = body?.sourceCodeLocation?.startTag;
  if (!startTag) throw new Error("Missing body element");
  const attr = body?.sourceCodeLocation?.attrs?.["data-ht-bg"];
  let updated = attr ? html.slice(0, attr.startOffset) + html.slice(attr.endOffset) : html;
  const insertion = startTag.endOffset - 1 - (attr ? attr.endOffset - attr.startOffset : 0);
  if (value) updated = updated.slice(0, insertion) + ` data-ht-bg="${value}"` + updated.slice(insertion);
  return syncAppearanceStyle(updated);
}
