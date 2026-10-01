import type { KeyboardEvent } from "react";

import type { TreeNode } from "@/lib/types";
import { normalizeText, textMatch } from "@/lib/textMatch";

export function filterTree(tree: TreeNode[], query: string, options: { tag?: string } = {}): { tree: TreeNode[]; autoExpanded: Set<string> } {
  const term = query.trim();
  const tag = options.tag;
  const autoExpanded = new Set<string>();
  if (!term && !tag) return { tree, autoExpanded };

  function visit(nodes: TreeNode[], folderMatched: boolean): TreeNode[] {
    const result: TreeNode[] = [];
    for (const node of nodes) {
      if (node.type === "note") {
        if ((!term || folderMatched || textMatch(node.title, term)) && (!tag || node.tags.includes(tag))) result.push(node);
        continue;
      }
      const matched = folderMatched || (!!term && textMatch(node.name, term));
      const children = visit(node.children, matched);
      if (children.length || (matched && !tag)) {
        if (children.length || matched) autoExpanded.add(node.relPath);
        result.push(children === node.children ? node : { ...node, children });
      }
    }
    return result;
  }

  return { tree: visit(tree, false), autoExpanded };
}

export function matchRange(value: string, query: string): [number, number] | null {
  const needle = normalizeText(query.trim());
  if (!needle) return null;
  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const character of value) {
    const part = normalizeText(character);
    for (let index = 0; index < part.length; index++) {
      starts.push(offset);
      ends.push(offset + character.length);
    }
    normalized += part;
    offset += character.length;
  }
  const index = normalized.indexOf(needle);
  return index < 0 ? null : [starts[index], ends[index + needle.length - 1]];
}

export function handleQuickFilterKeyDown(event: KeyboardEvent<HTMLInputElement>, clear: () => void) {
  if (event.key === "Escape") {
    event.preventDefault();
    clear();
  } else if (event.key === "ArrowDown") {
    const first = event.currentTarget.closest("aside")?.querySelector<HTMLElement>('[role="treeitem"]');
    if (first) {
      event.preventDefault();
      first.focus();
    }
  }
}
