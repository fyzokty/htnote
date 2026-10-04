import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SidebarTree } from "./SidebarTree";
import { SidebarFooter } from "./SidebarFooter";
import { TagsSection } from "@/features/tags/TagsSection";
import { FavoritesSection } from "@/features/favorites/FavoritesSection";
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

it("keeps a closing group inert for 140ms, updates navigation immediately, and removes it", () => {
  const view = render(<SidebarTree onOpenNote={vi.fn()} />);
  const folder = screen.getByRole("treeitem", { name: "Klasör: A" });
  fireEvent.click(folder);
  const group = view.container.querySelector('[role="group"]')!;
  expect(folder).toHaveAttribute("aria-owns", group.id);
  expect(group).toHaveAttribute("data-animate", "true");
  expect(group).not.toHaveAttribute("inert");
  fireEvent.click(folder);
  expect(folder).toHaveAttribute("aria-expanded", "false");
  expect(group).toHaveAttribute("inert");
  expect(group).toHaveAttribute("aria-hidden", "true");
  expect(group.querySelector('[data-tree-key="note:n"]')).toHaveAttribute("tabindex", "-1");
  fireEvent.keyDown(folder, { key: "ArrowDown" });
  expect(document.activeElement).toBe(folder);
  act(() => vi.advanceTimersByTime(139));
  expect(view.container.querySelector('[role="group"]')).toBe(group);
  act(() => vi.advanceTimersByTime(1));
  expect(view.container.querySelector('[role="group"]')).toBeNull();
});

it("removes immediately with reduced motion, including a preference change during closing", () => {
  const view = render(<SidebarTree onOpenNote={vi.fn()} />);
  const folder = screen.getByRole("treeitem", { name: "Klasör: A" });
  fireEvent.click(folder);
  fireEvent.click(folder);
  expect(view.container.querySelector('[role="group"]')).not.toBeNull();
  act(() => useSettingsStore.setState({ settings: { motion: "off" } as Settings }));
  expect(view.container.querySelector('[role="group"]')).toBeNull();
  fireEvent.click(folder);
  fireEvent.click(folder);
  expect(view.container.querySelector('[role="group"]')).toBeNull();
});

it("keeps reopened content after the interrupted close timer", () => {
  render(<SidebarTree onOpenNote={vi.fn()} />);
  const folder = screen.getByRole("treeitem", { name: "Klasör: A" });
  fireEvent.click(folder); fireEvent.click(folder);
  act(() => vi.advanceTimersByTime(70));
  fireEvent.click(folder);
  act(() => vi.advanceTimersByTime(140));
  expect(screen.getByRole("treeitem", { name: "Not: Note" })).toBeInTheDocument();
});

it("keeps folders flexible and tags immediately before the fixed footer when folders close", () => {
  render(<aside className="flex min-h-0 flex-col"><div className="htnote-sidebar-sections flex min-h-0 flex-1 flex-col"><FavoritesSection onOpenNote={vi.fn()} /><SidebarTree onOpenNote={vi.fn()} /><TagsSection /></div><SidebarFooter /></aside>);
  const folders = screen.getByRole("region", { name: "KLASÖRLER" });
  const tags = screen.getByRole("region", { name: "Etiketler" });
  const footer = screen.getByTestId("trash").parentElement!;
  fireEvent.click(screen.getByRole("button", { name: "KLASÖRLER" }));
  act(() => vi.advanceTimersByTime(140));
  expect(folders).toHaveClass("flex-1", "min-h-0");
  expect(folders.nextElementSibling).toBe(tags);
  expect(tags.parentElement!.nextElementSibling).toBe(footer);
  expect(tags).toHaveClass("shrink-0");
  expect(footer).toHaveClass("mt-auto", "shrink-0");
});

it("skips programmatic and filtered expansion animations", () => {
  const view = render(<SidebarTree onOpenNote={vi.fn()} />);
  act(() => useTreeStore.getState().toggle("A"));
  expect(view.container.querySelector('[role="group"]')).toHaveAttribute("data-animate", "false");
  act(() => useTreeStore.getState().toggle("A"));
  expect(view.container.querySelector('[role="group"]')).toBeNull();
  act(() => useTreeStore.getState().setFilterQuery("Note"));
  expect(view.container.querySelector('[role="group"]')).toHaveAttribute("data-animate", "false");
});
