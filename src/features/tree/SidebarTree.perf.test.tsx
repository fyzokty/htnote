import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { SidebarTree } from "@/features/tree/SidebarTree";
import type { TreeNode } from "@/lib/types";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";

it("reports first render with 2,000 notes, expanded and collapsed", () => {
  const folders: TreeNode[] = Array.from({ length: 150 }, (_, i) => ({
    type: "folder" as const,
    name: `Klasör ${i}`,
    relPath: `Klasör ${i}`,
    children: [],
  }));
  for (let i = 0; i < 2000; i++) {
    const folder = folders[i % folders.length];
    if (folder.type === "folder") folder.children.push({
      type: "note", id: `note-${i}`, title: `Türkçe not ${i}`,
      relPath: `${folder.relPath}/Not ${i}`, isFavorite: false, tags: [], updatedAt: "2026-01-01T00:00:00.000Z",
    });
  }
  for (const expanded of [new Set<string>(), new Set(folders.map((folder) => folder.relPath))]) {
    resetTreeStoreForTests();
    useTreeStore.setState({ tree: folders, expanded });
    const start = performance.now();
    const view = render(<SidebarTree onOpenNote={vi.fn()} />);
    const elapsed = performance.now() - start;
    const rows = view.container.querySelectorAll('[role="treeitem"]').length;
    console.info(`tree_render expanded=${expanded.size > 0} ms=${elapsed.toFixed(2)} rows=${rows}`);
    expect(rows).toBe(expanded.size ? 2150 : 150);
    view.unmount();
  }
});
