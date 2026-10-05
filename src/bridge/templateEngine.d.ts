export interface TemplateVariable { key: string; name: string; defaultValue: string }
export type TemplateSegment = { text: string } | { key: string };
export interface ParsedTemplate { variables: TemplateVariable[]; segments: TemplateSegment[] }
declare global {
  var HTNOTE_TEMPLATE_ENGINE: Readonly<{ parseTemplate(source: string): ParsedTemplate }>;
}
