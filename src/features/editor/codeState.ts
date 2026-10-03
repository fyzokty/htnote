import { EditorState, Compartment } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { basicSetup } from "codemirror";
import { isolateHistory } from "@codemirror/commands";

import type { ThemeMode } from "@/lib/theme";
import { formatHtml } from "@/features/editor/formatHtml";

export type CodeTab = "html" | "css" | "js";
export type CodeChange = Partial<Record<CodeTab, string>>;

export function codeChange(tab: CodeTab, doc: string): CodeChange {
  return { [tab]: doc };
}

export function codeTheme(mode: ThemeMode): Extension {
  return EditorView.theme({
    "&": { color: "var(--app-text)", backgroundColor: "var(--app-surface)", height: "100%" },
    ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: "13px", lineHeight: "1.6" },
    ".cm-gutters": { backgroundColor: "var(--app-subtle)", color: "var(--app-muted)", borderRight: "1px solid var(--app-border)" },
    ".cm-activeLine": { backgroundColor: "var(--app-subtle)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--app-subtle)" },
  }, { dark: mode === "dark" });
}

export function createCodeState(tab: CodeTab, doc: string, theme: Compartment, mode: ThemeMode, extraExtensions: Extension[] = []): EditorState {
  const language = tab === "html" ? html() : tab === "css" ? css() : javascript();
  return EditorState.create({
    doc,
    extensions: [basicSetup, EditorView.lineWrapping, EditorState.tabSize.of(2), indentUnit.of("  "), language, theme.of(codeTheme(mode)), ...extraExtensions],
  });
}

export function formatHtmlDocument(view: EditorView): boolean {
  const original = view.state.doc.toString();
  const formatted = formatHtml(original);
  if (original !== formatted) view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: formatted },
    annotations: isolateHistory.of("full"),
    userEvent: "input.format",
  });
  return true;
}
