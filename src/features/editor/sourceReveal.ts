import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

export const sourceWidgetTypes = ["textbox", "checklist", "copyfields", "template", "calc", "ipblock"] as const;
export type SourceLocator =
  | { kind: "widget"; index: number; widget: typeof sourceWidgetTypes[number] }
  | { kind: "block"; index: number; tag: string };
export type SourceRange = { from: number; to: number };

const handlers = new Map<string, (locator: SourceLocator) => void>();

export function registerSourceReveal(noteId: string, handler: (locator: SourceLocator) => void): () => void {
  handlers.set(noteId, handler);
  return () => { if (handlers.get(noteId) === handler) handlers.delete(noteId); };
}

export function revealSource(noteId: string, locator: SourceLocator): boolean {
  const handler = handlers.get(noteId);
  if (!handler) return false;
  handler(locator);
  return true;
}

function openingTag(element: SyntaxNode): SyntaxNode | null {
  return element.getChild("OpenTag") ?? element.getChild("SelfClosingTag");
}

function tagName(state: EditorState, element: SyntaxNode): string | undefined {
  const name = openingTag(element)?.getChild("TagName");
  return name ? state.sliceDoc(name.from, name.to).toLowerCase() : undefined;
}

function attribute(state: EditorState, element: SyntaxNode, name: string): string | undefined {
  for (const attr of openingTag(element)?.getChildren("Attribute") ?? []) {
    const key = attr.getChild("AttributeName");
    if (!key || state.sliceDoc(key.from, key.to).toLowerCase() !== name) continue;
    const value = attr.getChild("AttributeValue") ?? attr.getChild("UnquotedAttributeValue");
    if (!value) return "";
    const text = state.sliceDoc(value.from, value.to);
    return /^["']/.test(text) ? text.slice(1, -1) : text;
  }
  return undefined;
}

export function findSourceRange(state: EditorState, locator: SourceLocator): SourceRange | null {
  if (!Number.isInteger(locator.index) || locator.index < 0 || locator.index > 9999) return null;
  const tree = ensureSyntaxTree(state, state.doc.length, 100) ?? syntaxTree(state);
  let result: SourceRange | null = null;
  let index = 0;
  let matched = false;
  tree.iterate({
    enter(node) {
      if (matched) return false;
      // Gömülü JS/CSS ve textarea metni HTML öğesi olarak gezilmez.
      if (node.name !== "Element") return node.name === "Document";
      const element = node.node;
      if (locator.kind === "widget") {
        const widget = attribute(state, element, "data-htnote-widget");
        if (widget !== undefined && index++ === locator.index) {
          matched = true;
          if (widget === locator.widget) result = { from: element.from, to: element.to };
        }
      } else if (tagName(state, element) === "main" && attribute(state, element, "id") === "htnote-content") {
        matched = true;
        const child = element.getChildren("Element")[locator.index];
        if (child && tagName(state, child) === locator.tag) result = { from: child.from, to: child.to };
      }
      return !matched;
    },
  });
  return result;
}
