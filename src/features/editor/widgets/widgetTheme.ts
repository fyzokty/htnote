// Sabit tema eşleri, host'un istenen modu etkin kabuktan bağımsız okuyabilmesini sağlar.
export const WIDGET_THEME_TOKENS = ["surface", "text", "accent", "border", "divider", "muted", "field", "hover"] as const;

export function widgetThemeDeclarations(mode: "light" | "dark", tokens: CSSStyleDeclaration): string {
  return WIDGET_THEME_TOKENS.map((name) => {
    const value = tokens.getPropertyValue(`--app-widget-${name}-${mode}`).trim();
    return /^#[\da-f]{6}$/i.test(value) ? `--ht-widget-${name}:${value};` : "";
  }).join("");
}

// Bridge olmayan HTML çıktısında da alanlar kendi güvenli açık tema yedeklerini taşır.
export const widgetBaseCss = `
:where(.htnote-textbox){position:relative;box-sizing:border-box;margin:1em 0;padding:12px;border:1px solid var(--ht-widget-border,#7b8598);border-radius:12px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-surface,#ffffff)}
:where(.htnote-textbox-title){font-weight:700;min-height:1lh;margin-bottom:8px;white-space:pre-wrap;overflow-wrap:anywhere}
:where(.htnote-textbox-input){box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--ht-widget-border,#7b8598);border-radius:8px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-field,#f8f9ff)}
:where(.htnote-textbox-input){display:block;min-height:4.8em;field-sizing:content;resize:vertical;font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-y:hidden}
:where(.htnote-textbox-input:focus-visible){outline:2px solid var(--ht-widget-accent,#4648d4);outline-offset:2px}
`;
