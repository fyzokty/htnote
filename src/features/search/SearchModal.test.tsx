import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { fsChangeBus } from "@/lib/events";
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
  await waitFor(() => expect(useTabsStore.getState().tabs.map((tab) => tab.noteId)).toEqual(["b"]));
  expect(useTabsStore.getState().activeId).toBeNull();
  expect(useUiStore.getState().searchOpen).toBe(true);
  fireEvent.keyDown(input, { key: "ArrowUp" });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(useTabsStore.getState().activeId).toBe("a"));
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

it("reruns the open query on content changes and ignores a pending stale response", async () => {
  let resolveOld!: (value: SearchNotesResult) => void;
  let calls = 0;
  mockIPC((command) => {
    if (command !== "search_notes") return;
    calls++;
    if (calls === 1) return new Promise<SearchNotesResult>((resolve) => { resolveOld = resolve; });
    return { indexing: false, results: [results.results[1]] };
  });
  render(<SearchModal />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alpha" } });
  await waitFor(() => expect(calls).toBe(1));
  act(() => fsChangeBus.publish({ changedNoteIds: ["b"], removedNoteIds: [], treeChanged: false, trashChanged: false }));
  await act(async () => resolveOld(results));
  expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("Beta")).toBeInTheDocument());
  expect(calls).toBe(2);
});

it("clears removed results and freshly queries the last query when reopened", async () => {
  let response = results;
  const search = vi.fn(() => response);
  mockIPC((command) => command === "search_notes" ? search() : undefined);
  const modal = render(<SearchModal />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alpha" } });
  await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
  response = { indexing: false, results: [] };
  act(() => fsChangeBus.publish({ changedNoteIds: [], removedNoteIds: ["a", "b"], treeChanged: true, trashChanged: false }));
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
  await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  modal.unmount();
  response = { indexing: false, results: [results.results[1]] };
  render(<SearchModal />);
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("Beta")).toBeInTheDocument());
  expect(search).toHaveBeenCalledTimes(3);
});

it("reports a deleted result instead of opening a missing note", async () => {
  mockIPC((command) => {
    if (command === "search_notes") return results;
    if (command === "read_note") return Promise.reject({ code: "NOTE_NOT_FOUND", message: "gone" });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<SearchModal />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alpha" } });
  await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
  fireEvent.click(screen.getByText("Alpha"));
  await waitFor(() => expect(useUiStore.getState().toasts.slice(-1)[0]?.messageKey).toBe("errors.NOTE_NOT_FOUND"));
  expect(useTabsStore.getState().tabs).toEqual([]);
  expect(useUiStore.getState().searchOpen).toBe(true);
});


it("allows snippet selection without opening the result on the trailing mouse click", async () => {
  mockIPC((command) => command === "search_notes" ? results : undefined);
  render(<SearchModal />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alpha" } });
  const text = await screen.findByText("<img src=x>");
  expect(text.parentElement).toHaveClass("select-text");
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.selectNodeContents(text);
  selection.addRange(range);
  try {
    fireEvent.click(screen.getByRole("option", { name: /Alpha/ }), { detail: 1 });
    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(useUiStore.getState().searchOpen).toBe(true);
  } finally {
    selection.removeAllRanges();
  }
  fireEvent.click(screen.getByRole("option", { name: /Alpha/ }), { detail: 1 });
  await waitFor(() => expect(useTabsStore.getState().activeId).toBe("a"));
});
