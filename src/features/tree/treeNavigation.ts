import type { TreeNode } from "@/lib/types";

export type TreeKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export interface VisibleNode {
  node: TreeNode;
  depth: number;
  parentRelPath: string | null;
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

export function nextVisibleNode(tree: TreeNode[], expanded: Set<string>, current: TreeNode | null, key: TreeKey): TreeNode | null {
  const visible = visibleNodes(tree, expanded);
  if (visible.length === 0) return null;
  const index = visible.findIndex(({ node }) => node.type === current?.type &&
    (node.type === "folder" ? node.relPath === current.relPath : node.id === (current?.type === "note" ? current.id : null)));
  if (index < 0) return visible[0].node;
  const entry = visible[index];
  if (key === "ArrowUp") return visible[Math.max(0, index - 1)].node;
  if (key === "ArrowDown") return visible[Math.min(visible.length - 1, index + 1)].node;
  if (key === "ArrowRight") {
    if (entry.node.type === "folder" && expanded.has(entry.node.relPath) && entry.node.children.length) {
      return visible[index + 1].node;
    }
    return entry.node;
  }
  if (entry.node.type === "folder" && expanded.has(entry.node.relPath)) return entry.node;
  return visible.find(({ node }) => node.type === "folder" && node.relPath === entry.parentRelPath)?.node ?? entry.node;
}
