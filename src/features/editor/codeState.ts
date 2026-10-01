import { EditorState, Compartment } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { basicSetup } from "codemirror";

import type { ThemeMode } from "@/lib/theme";

export type CodeTab = "html" | "css" | "js";
export type CodeChange = Partial<Record<CodeTab, string>>;

export function codeChange(tab: CodeTab, doc: string): CodeChange {
  return { [tab]: doc };
}

export function codeTheme(mode: ThemeMode): Extension {
  return EditorView.theme({
    "&": { color: "var(--app-text)", backgroundColor: "var(--app-surface)", height: "100%" },
    ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" },
    ".cm-gutters": { backgroundColor: "var(--app-subtle)", color: "var(--app-muted)", borderRight: "1px solid var(--app-border)" },
    ".cm-activeLine": { backgroundColor: "var(--app-subtle)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--app-subtle)" },
  }, { dark: mode === "dark" });
}

export function createCodeState(tab: CodeTab, doc: string, theme: Compartment, mode: ThemeMode, extraExtensions: Extension[] = []): EditorState {
  const language = tab === "html" ? html() : tab === "css" ? css() : javascript();
  return EditorState.create({
    doc,
    extensions: [basicSetup, EditorState.tabSize.of(2), indentUnit.of("  "), language, theme.of(codeTheme(mode)), ...extraExtensions],
  });
}
