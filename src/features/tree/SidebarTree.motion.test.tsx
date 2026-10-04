import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SidebarTree } from "./SidebarTree";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Settings } from "@/lib/types";

beforeEach(() => {
  vi.useFakeTimers();
  resetTreeStoreForTests();
  useSettingsStore.setState({ settings: { motion: "on" } as Settings });
  useTreeStore.setState({ tree: [{ type: "folder", name: "A", relPath: "A", children: [{ type: "note", id: "n", title: "Note", relPath: "A/Note", isFavorite: true, tags: ["tag"], updatedAt: "" }] }] });
});
afterEach(() => { vi.useRealTimers(); useSettingsStore.setState({ settings: null }); });

it("updates navigation and accessibility attributes immediately when closing a group", () => {
  const view = render(<SidebarTree onOpenNote={vi.fn()} />);
  const folder = screen.getByRole("treeitem", { name: "Klasör: A" });
  fireEvent.click(folder);
  const group = view.container.querySelector('[role="group"]')!;
  expect(folder).toHaveAttribute("aria-owns", group.id);
  expect(group).not.toHaveAttribute("inert");
  fireEvent.click(folder);
  expect(folder).toHaveAttribute("aria-expanded", "false");
  expect(group).toHaveAttribute("inert");
  expect(group).toHaveAttribute("aria-hidden", "true");
  expect(group.querySelector('[data-tree-key="note:n"]')).toHaveAttribute("tabindex", "-1");
  fireEvent.keyDown(folder, { key: "ArrowDown" });
  expect(document.activeElement).toBe(folder);
  act(() => vi.runAllTimers());
  expect(view.container.querySelector('[role="group"]')).toBeNull();
});

