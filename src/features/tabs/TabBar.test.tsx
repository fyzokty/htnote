import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TabBar } from "@/features/tabs/TabBar";
import { dispatchShortcut } from "@/lib/shortcuts/manager";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";

const notes = [
  { type: "note" as const, id: "a", title: "Alpha", relPath: "folder/Alpha", isFavorite: false, tags: [], updatedAt: "" },
  { type: "note" as const, id: "b", title: "Beta", relPath: "folder/Beta", isFavorite: false, tags: [], updatedAt: "" },
];

beforeEach(() => {
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  useTreeStore.setState({ tree: [{ type: "folder", relPath: "folder", name: "folder", children: notes }] });
  useTabsStore.getState().openNote("a");
  useTabsStore.getState().openNote("b");
});

describe("TabBar", () => {
  it("shows the dirty dot from the tab document", () => {
    useTabsStore.getState().enterEdit("a", { html: "old", css: null, js: null, contentHash: "hash" });
    useTabsStore.getState().updateDraft("a", { html: "new" });
    render(<TabBar />);
    expect(screen.getByRole("tab", { name: "Alpha" }).querySelector("span[aria-hidden]" )).not.toHaveClass("hidden");
    act(() => useTabsStore.getState().updateDraft("a", { html: "old" }));
    expect(screen.getByRole("tab", { name: "Alpha" }).querySelector("span[aria-hidden]" )).toHaveClass("hidden");
  });
  it("renders live titles, highlights and activates tabs", () => {
    render(<TabBar />);
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    const beta = screen.getByRole("tab", { name: "Beta" });
    expect(alpha).toHaveAttribute("title", "Alpha");
    expect(beta).toHaveAttribute("aria-selected", "true");
    fireEvent.click(alpha);
    expect(alpha).toHaveAttribute("aria-selected", "true");
    act(() => {
      useTreeStore.setState({ tree: [{ type: "folder", relPath: "folder", name: "folder", children: [{ ...notes[0], title: "Renamed" }, notes[1]] }] });
    });
    expect(screen.getByRole("tab", { name: "Renamed" })).toHaveAttribute("title", "Renamed");
  });

  it("closes tabs with the middle button and close control", async () => {
    render(<TabBar />);
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    fireEvent.mouseDown(alpha, { button: 1 });
    fireEvent(alpha, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Alpha" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Beta sekmesini kapat" }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Beta" })).not.toBeInTheDocument());
  });

  it("provides close, close others and reveal actions", async () => {
    const reveal = vi.spyOn(useTreeStore.getState(), "revealNote");
    render(<TabBar />);
    fireEvent.contextMenu(screen.getByRole("tab", { name: "Alpha" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Ağaçta Göster" }));
    expect(reveal).toHaveBeenCalledWith("a");
    fireEvent.contextMenu(screen.getByRole("tab", { name: "Alpha" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Diğerlerini Kapat" }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Beta" })).not.toBeInTheDocument());
    fireEvent.contextMenu(screen.getByRole("tab", { name: "Alpha" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^KapatCtrl\+W$/ }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Alpha" })).not.toBeInTheDocument());
    reveal.mockRestore();
  });

  it("navigates and closes the active tab through shortcuts", async () => {
    render(<TabBar />);
    act(() => { expect(dispatchShortcut("nextTab")).toBe(true); });
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
    act(() => { expect(dispatchShortcut("prevTab")).toBe(true); });
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
    act(() => { expect(dispatchShortcut("closeTab")).toBe(true); });
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Beta" })).not.toBeInTheDocument());
  });
});
