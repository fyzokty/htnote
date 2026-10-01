import type { TreeNode } from "@/lib/types";

export function canDrop(source: TreeNode, targetRelPath: string, tree: TreeNode[]): boolean {
  const parent = source.relPath.includes("/") ? source.relPath.slice(0, source.relPath.lastIndexOf("/")) : "";
  if (targetRelPath === parent || targetRelPath === source.relPath) return false;
  if (source.type === "folder" && targetRelPath.startsWith(`${source.relPath}/`)) return false;
  if (targetRelPath === "") return true;
  function find(nodes: TreeNode[]): TreeNode | undefined {
    for (const node of nodes) {
      if (node.relPath === targetRelPath) return node;
      if (node.type === "folder") {
        const found = find(node.children);
        if (found) return found;
      }
    }
    return undefined;
  }
  return find(tree)?.type === "folder";
}
