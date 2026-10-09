import { EditorState, Compartment, StateEffect, StateField } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { basicSetup } from "codemirror";
import { isolateHistory } from "@codemirror/commands";

import type { ThemeMode } from "@/lib/theme";
import { formatHtml } from "@/features/editor/formatHtml";
import { prepareCodeDrop } from "./codeDrop";
import type { SourceRange } from "./sourceReveal";

export type CodeTab = "html" | "css" | "js";
export type CodeChange = Partial<Record<CodeTab, string>>;

export const sourceHighlight = StateEffect.define<(SourceRange & { reduced: boolean }) | null>();
export const sourceHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    decorations = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(sourceHighlight)) continue;
      const range = effect.value;
      decorations = range && range.from < range.to
        ? Decoration.set([Decoration.mark({ class: `cm-source-reveal${range.reduced ? " cm-source-reveal-static" : ""}` }).range(range.from, range.to)])
        : Decoration.none;
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const sourceHighlightTheme = EditorView.baseTheme({
  ".cm-source-reveal": {
    backgroundColor: "color-mix(in srgb, var(--app-accent) 24%, transparent)",
    animation: "htnote-source-reveal 1200ms ease-out forwards",
  },
  ".cm-source-reveal-static": { animation: "none" },
  "[data-reduced-motion=true] & .cm-source-reveal": { animation: "none" },
  "@keyframes htnote-source-reveal": {
    from: { backgroundColor: "color-mix(in srgb, var(--app-accent) 24%, transparent)" },
    to: { backgroundColor: "transparent" },
  },
});

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
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--app-accent)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "color-mix(in srgb, var(--app-accent) 24%, transparent)" },
  }, { dark: mode === "dark" });
}

export function createCodeState(tab: CodeTab, doc: string, theme: Compartment, mode: ThemeMode, extraExtensions: Extension[] = []): EditorState {
  const language = tab === "html" ? html() : tab === "css" ? css() : javascript();
  return EditorState.create({
    doc,
    extensions: [basicSetup, syntaxHighlighting(HighlightStyle.define([
      { tag: [tags.tagName, tags.keyword], color: "var(--app-code-html)" },
      { tag: [tags.attributeName, tags.propertyName], color: "var(--app-code-css)" },
      { tag: [tags.string, tags.number, tags.bool], color: "var(--app-code-js)" },
      { tag: tags.comment, color: "var(--app-muted)", fontStyle: "italic" },
    ])), EditorView.lineWrapping, EditorState.tabSize.of(2), indentUnit.of("  "), language, theme.of(codeTheme(mode)),
    ...(tab === "html" ? [sourceHighlightField, sourceHighlightTheme] : []), ...extraExtensions],
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

export function insertCodeDrop(view: EditorView, position: number, tags: string[]): void {
  const next = prepareCodeDrop(view.state.doc.toString(), position, tags);
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: next.document },
    selection: { anchor: next.cursor },
    annotations: isolateHistory.of("full"),
    userEvent: "input.drop",
  });
}
