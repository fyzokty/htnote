import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SearchModal } from "@/features/search/SearchModal";
import type { SearchNotesResult } from "@/lib/types";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

const results: SearchNotesResult = { indexing: false, results: [
  { id: "a", title: "Alpha", relPath: "folder/Alpha", titleMatch: false, matchCount: 1, snippets: [{ before: "<img src=x>", match: "alpha", after: " end" }] },
  { id: "b", title: "Beta", relPath: "folder/Beta", titleMatch: false, matchCount: 2, snippets: [] },
] };

beforeEach(() => {
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  useUiStore.setState({ searchOpen: true, lastSearchQuery: "" });
});
afterEach(() => vi.restoreAllMocks());

it("ignores a late response to an older query", async () => {
  let resolveOld!: (value: SearchNotesResult) => void;
  mockIPC((command, args) => {
    if (command !== "search_notes") return;
    if ((args as { query: string }).query === "old") return new Promise<SearchNotesResult>((resolve) => { resolveOld = resolve; });
    return { indexing: true, results: [results.results[1]] };
  });
  render(<SearchModal />);
  const input = screen.getByRole("searchbox");
  fireEvent.change(input, { target: { value: "old" } });
  await waitFor(() => expect(resolveOld).toBeDefined());
  fireEvent.change(input, { target: { value: "new" } });
  await waitFor(() => expect(screen.getByText("Beta")).toBeInTheDocument());
  await act(async () => resolveOld(results));
  expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  expect(screen.getByText("Notlar indeksleniyor...")).toBeInTheDocument();
});

it("navigates results and opens foreground or background tabs", async () => {
  mockIPC((command) => command === "search_notes" ? results : undefined);
  render(<SearchModal />);
  const input = screen.getByRole("searchbox");
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: "alpha" } });
  await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("<img src=x>")).toBeInTheDocument();
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
  expect(useTabsStore.getState().tabs.map((tab) => tab.noteId)).toEqual(["b"]);
  expect(useTabsStore.getState().activeId).toBeNull();
  expect(useUiStore.getState().searchOpen).toBe(true);
  fireEvent.keyDown(input, { key: "ArrowUp" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(useTabsStore.getState().activeId).toBe("a");
  expect(useUiStore.getState().searchOpen).toBe(false);
});

it("closes on Escape and selects the previous query", () => {
  useUiStore.setState({ lastSearchQuery: "önceki" });
  mockIPC(() => ({ indexing: false, results: [] }));
  render(<SearchModal />);
  const input = screen.getByRole("searchbox") as HTMLInputElement;
  expect(input.value).toBe("önceki");
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(input.value.length);
  fireEvent.keyDown(input, { key: "Escape" });
  expect(useUiStore.getState().searchOpen).toBe(false);
});
