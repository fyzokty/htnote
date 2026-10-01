import type { TreeNode } from "@/lib/types";

export type TreeKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export interface VisibleNode {
  node: TreeNode;
  depth: number;
  parentRelPath: string | null;
}

export interface NavigationResult {
  node: TreeNode;
  expansion?: "expand" | "collapse";
}

export function visibleNodes(tree: TreeNode[], expanded: Set<string>): VisibleNode[] {
  const result: VisibleNode[] = [];
  function append(nodes: TreeNode[], depth: number, parentRelPath: string | null) {
    for (const node of nodes) {
      result.push({ node, depth, parentRelPath });
      if (node.type === "folder" && expanded.has(node.relPath)) {
        append(node.children, depth + 1, node.relPath);
      }
    }
  }
  append(tree, 0, null);
  return result;
}

export function nextVisibleNode(tree: TreeNode[], expanded: Set<string>, current: TreeNode | null, key: TreeKey): NavigationResult | null {
  const visible = visibleNodes(tree, expanded);
  if (visible.length === 0) return null;
  const index = visible.findIndex(({ node }) => node.type === current?.type &&
    (node.type === "folder" ? node.relPath === current.relPath : node.id === (current?.type === "note" ? current.id : null)));
  if (index < 0) return { node: visible[0].node };
  const entry = visible[index];
  if (key === "ArrowUp") return { node: visible[Math.max(0, index - 1)].node };
  if (key === "ArrowDown") return { node: visible[Math.min(visible.length - 1, index + 1)].node };
  if (key === "ArrowRight") {
    if (entry.node.type === "folder") {
      if (!expanded.has(entry.node.relPath)) return { node: entry.node, expansion: "expand" };
      if (entry.node.children.length) return { node: visible[index + 1].node };
    }
    return { node: entry.node };
  }
  if (entry.node.type === "folder" && expanded.has(entry.node.relPath)) return { node: entry.node, expansion: "collapse" };
  return { node: visible.find(({ node }) => node.type === "folder" && node.relPath === entry.parentRelPath)?.node ?? entry.node };
}
