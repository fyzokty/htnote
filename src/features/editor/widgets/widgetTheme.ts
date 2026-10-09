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
@media(prefers-color-scheme:dark){:where(html:not([data-ht-theme])){--ht-widget-shadow:0 10px 25px -4px #00000040,0 4px 10px -2px #00000026}}
:where(html[data-ht-theme="dark"]){--ht-widget-shadow:0 10px 25px -4px #00000040,0 4px 10px -2px #00000026}
:where(.htnote-textbox){position:relative;box-sizing:border-box;margin:1em 0;padding:20px;border:1px solid var(--ht-widget-divider,#e0e3ee);border-radius:16px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-surface,#ffffff);box-shadow:var(--ht-widget-shadow,0 10px 25px -4px #4755690f,0 4px 10px -2px #6366f10a);font-family:var(--ht-font,system-ui,sans-serif)}
:where(.htnote-textbox > .htnote-textbox-title){font:600 18px/1.4 var(--ht-font,system-ui,sans-serif);min-height:1lh;margin-bottom:8px;white-space:pre-wrap;overflow-wrap:anywhere}
:where(.htnote-textbox-input){box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--ht-widget-border,#7b8598);border-radius:8px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-field,#f8f9ff)}
:where(.htnote-textbox-input){display:block;min-height:4.8em;field-sizing:content;resize:vertical;font:15px/1.6 var(--ht-font,system-ui,sans-serif);overflow-y:hidden}
:where(.htnote-textbox-input:focus-visible){outline:2px solid var(--ht-widget-accent,#4648d4);outline-offset:2px}
:where(.htnote-checklist){box-sizing:border-box;margin:1em 0;padding:20px;border:1px solid var(--ht-widget-divider,#e0e3ee);border-radius:16px;color:var(--ht-widget-text);background:var(--ht-widget-surface);box-shadow:var(--ht-widget-shadow,0 10px 25px -4px #4755690f,0 4px 10px -2px #6366f10a);font-family:var(--ht-font,system-ui,sans-serif)}
:where(.htnote-checklist > .htnote-checklist-title){font:600 18px/1.4 var(--ht-font,system-ui,sans-serif);min-height:1lh;margin-bottom:8px;white-space:pre-wrap;overflow-wrap:anywhere}
:where(.htnote-checklist-items){list-style:none;margin:0;padding:0}
:where(.htnote-checklist-items li){padding:10px 0;border-top:1px solid var(--ht-widget-divider);overflow-wrap:anywhere}
:where(.htnote-checklist-items label){cursor:pointer}
:where(.htnote-checklist-items input){width:16px;height:16px;vertical-align:middle;accent-color:var(--ht-widget-accent)}
:where(.htnote-checklist-items input:focus-visible){outline:2px solid var(--ht-widget-accent);outline-offset:2px}

:where(.htnote-copyfields){box-sizing:border-box;margin:1em 0;padding:20px;border:1px solid var(--ht-widget-divider,#e0e3ee);border-radius:16px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-surface,#ffffff);box-shadow:var(--ht-widget-shadow,0 10px 25px -4px #4755690f,0 4px 10px -2px #6366f10a);font-family:var(--ht-font,system-ui,sans-serif)}
:where(.htnote-copyfields > .htnote-copyfields-title){font:600 18px/1.4 var(--ht-font,system-ui,sans-serif);min-height:1lh;margin-bottom:8px;white-space:pre-wrap;overflow-wrap:anywhere}
:where(.htnote-copyfields-list){margin:0;padding:0}
:where(.htnote-copyfields-row){display:grid;grid-template-columns:minmax(0,120px) minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 12px;margin-bottom:8px;border:1px solid var(--ht-widget-row-border,var(--ht-widget-divider,#e0e3ee));border-radius:8px;background:color-mix(in srgb,var(--ht-widget-surface,#ffffff) 65%,transparent)}
:where(.htnote-copyfields-row dt){font-size:14px;font-weight:500;overflow-wrap:anywhere}
:where(.htnote-copyfields-row dd){min-width:0;margin:0;padding:4px 8px;border:1px solid var(--ht-widget-divider,#e0e3ee);justify-self:start;max-width:100%;box-sizing:border-box;border-radius:8px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-field,#f8f9ff);font:14px/1.6 "Cascadia Code","Cascadia Mono",Consolas,ui-monospace,SFMono-Regular,monospace;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}
@media(max-width:480px){:where(.htnote-copyfields-row){grid-template-columns:minmax(0,1fr) auto}:where(.htnote-copyfields-row dt){grid-column:1/-1}}
:where(.htnote-copyfields){container-type:inline-size;container-name:widget}
@container widget (max-width:360px){:where(.htnote-copyfields-row){grid-template-columns:minmax(0,1fr) auto}:where(.htnote-copyfields-row dt){grid-column:1/-1}}

:where(.htnote-template,.htnote-calc){container-type:inline-size;box-sizing:border-box;margin:1em 0;padding:20px;border:1px solid var(--ht-widget-divider,#e0e3ee);border-radius:16px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-surface,#ffffff);box-shadow:var(--ht-widget-shadow,0 10px 25px -4px #4755690f,0 4px 10px -2px #6366f10a);font-family:var(--ht-font,system-ui,sans-serif)}
:where(.htnote-template > .htnote-template-title,.htnote-calc > .htnote-calc-title){font:600 18px/1.4 var(--ht-font,system-ui,sans-serif);min-height:1lh;margin-bottom:8px;white-space:pre-wrap;overflow-wrap:anywhere}
:where(.htnote-template-source,.htnote-calc > .htnote-calc-input){display:block;box-sizing:border-box;width:100%;min-height:4.8em;padding:8px;border:1px solid var(--ht-widget-border,#7b8598);border-radius:8px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-field,#f8f9ff);field-sizing:content;resize:vertical;font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace}
:where(.htnote-template-source:focus-visible,.htnote-calc > .htnote-calc-input:focus-visible){outline:2px solid var(--ht-widget-accent,#4648d4);outline-offset:2px}
`;
