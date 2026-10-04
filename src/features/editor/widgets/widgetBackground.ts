import { NOTE_BACKGROUNDS, type NoteBackground } from "@/features/viewer/noteAppearance";

export const WIDGET_BACKGROUNDS = NOTE_BACKGROUNDS;
export type WidgetBackground = NoteBackground;
export const WIDGET_BACKGROUND_ATTRIBUTE = "data-htnote-bg";

// Eksik öznitelik varsayılandır; boş veya bilinmeyen öznitelik geçersizdir.
export function readWidgetBackground(value: string | undefined): WidgetBackground | null {
  if (value === undefined) return "";
  return WIDGET_BACKGROUNDS.includes(value as typeof WIDGET_BACKGROUNDS[number]) ? value as WidgetBackground : null;
}

export function serializeWidgetBackground(value: WidgetBackground = ""): string {
  if (!value) return "";
  if (readWidgetBackground(value) === null) throw new Error("Invalid widget background");
  return ` ${WIDGET_BACKGROUND_ATTRIBUTE}="${value}"`;
}
