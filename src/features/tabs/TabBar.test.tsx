import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TabBar } from "@/features/tabs/TabBar";
import type { Settings } from "@/lib/types";
import { dispatchShortcut } from "@/lib/shortcuts/manager";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";

const notes = [
  { type: "note" as const, id: "a", title: "Alpha", relPath: "folder/Alpha", isFavorite: false, tags: [], updatedAt: "" },
  { type: "note" as const, id: "b", title: "Beta", relPath: "folder/Beta", isFavorite: false, tags: [], updatedAt: "" },
];

beforeEach(() => {
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  useSettingsStore.setState({ settings: null });
  useTreeStore.setState({ tree: [{ type: "folder", relPath: "folder", name: "folder", children: notes }] });
  useTabsStore.getState().openNote("a");
  useTabsStore.getState().openNote("b");
});

describe("TabBar", () => {
  it("shows the dirty dot from the tab document", () => {
    useTabsStore.getState().enterEdit("a", { html: "old", css: null, js: null, contentHash: "hash" });
    useTabsStore.getState().updateDraft("a", { html: "new" });
    render(<TabBar />);
    const tab = screen.getByRole("tab", { name: "Alpha" });
    const dot = tab.querySelector('[data-testid="tab-dirty"]');
    expect(dot).not.toHaveClass("hidden");
    expect(dot).toHaveClass("size-4", "group-hover:hidden", "group-focus-within:hidden");
    expect(tab.querySelector(".htnote-tab-close svg")).toHaveClass("size-4", "hidden", "group-hover:block", "group-focus-within:block");
    expect(screen.getByRole("button", { name: "Alpha sekmesini kapat" })).toHaveClass("htnote-tab-close");
    act(() => useTabsStore.getState().updateDraft("a", { html: "old" }));
    expect(dot).toHaveClass("hidden");
    expect(tab.querySelector(".htnote-tab-close svg")).not.toHaveClass("hidden");
  });

  it("renders special titles and icons, without the note reveal action", async () => {
    useTabsStore.getState().openSpecial("settings");
    useTabsStore.getState().openSpecial("trash");
    render(<TabBar />);
    const settings = screen.getByRole("tab", { name: "Ayarlar" });
    const trash = screen.getByRole("tab", { name: "Çöp Kutusu" });
    expect(settings.querySelectorAll("svg")).toHaveLength(2);
    expect(trash.querySelectorAll("svg")).toHaveLength(2);
    expect(settings.querySelector(".lucide-settings-2")).toBeInTheDocument();
    expect(trash.querySelector(".lucide-trash-2")).toBeInTheDocument();
    expect(trash).toHaveAttribute("aria-selected", "true");
    fireEvent.contextMenu(settings);
    expect(screen.queryByRole("menuitem", { name: "Ağaçta Göster" })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Ayarlar sekmesini kapat" }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Ayarlar" })).not.toBeInTheDocument());
    fireEvent(trash, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Çöp Kutusu" })).not.toBeInTheDocument());
  });

  it("applies fixed and title-based sizing to every tab", () => {
    useTabsStore.getState().openSpecial("settings");
    render(<TabBar />);
    for (const tab of screen.getAllByRole("tab")) expect(tab).toHaveClass("w-40");
    act(() => useSettingsStore.setState({ settings: { tabSizing: "fit" } as Settings }));
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveClass("w-max", "min-w-28", "max-w-64");
      expect(tab).not.toHaveClass("w-40");
    }
  });

  it("scrolls the active tab into view and converts wheel movement to horizontal scrolling", () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      const rendered = render(<TabBar />);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
      const strip = screen.getByRole("tablist");
      Object.defineProperties(strip, { scrollWidth: { value: 1000 }, clientWidth: { value: 300 } });
      const wheel = new WheelEvent("wheel", { deltaY: 50, bubbles: true, cancelable: true });
      fireEvent(strip, wheel);
      expect(strip.scrollLeft).toBe(50);
      expect(wheel.defaultPrevented).toBe(true);
      fireEvent.wheel(strip, { deltaY: 2, deltaMode: 1 });
      expect(strip.scrollLeft).toBe(82);
      fireEvent.wheel(strip, { deltaX: -20, deltaY: 1 });
      expect(strip.scrollLeft).toBe(62);
      fireEvent.wheel(strip, { deltaY: 50, ctrlKey: true });
      expect(strip.scrollLeft).toBe(62);
      scrollIntoView.mockClear();
      act(() => useTabsStore.getState().activate("a"));
      expect(scrollIntoView.mock.instances[0]).toBe(screen.getByRole("tab", { name: "Alpha" }));
      rendered.unmount();
      fireEvent.wheel(strip, { deltaY: 20 });
      expect(strip.scrollLeft).toBe(62);
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("navigates and closes special tabs through the same shortcuts", async () => {
    useTabsStore.getState().openSpecial("settings");
    useTabsStore.getState().openSpecial("trash");
    render(<TabBar />);
    act(() => { dispatchShortcut("prevTab"); });
    expect(screen.getByRole("tab", { name: "Ayarlar" })).toHaveAttribute("aria-selected", "true");
    act(() => { dispatchShortcut("nextTab"); });
    expect(screen.getByRole("tab", { name: "Çöp Kutusu" })).toHaveAttribute("aria-selected", "true");
    act(() => { dispatchShortcut("closeTab"); });
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Çöp Kutusu" })).not.toBeInTheDocument());
  });
  it("preserves manual strip scrolling while the active document changes", () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      render(<TabBar />);
      scrollIntoView.mockClear();
      const strip = screen.getByRole("tablist");
      strip.scrollLeft = 50;
      act(() => {
        const store = useTabsStore.getState();
        store.enterEdit("b", { html: "old", css: null, js: null, contentHash: "hash" });
        store.updateDraft("b", { html: "new" });
        store.markSaving("b");
      });
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(strip.scrollLeft).toBe(50);
      act(() => useTabsStore.getState().move(1, 0));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(screen.getByRole("tab", { name: "Beta" }));
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });
  it("renders live titles, highlights and activates tabs", () => {
    render(<TabBar />);
    const alpha = screen.getByRole("tab", { name: "Alpha" });
    const beta = screen.getByRole("tab", { name: "Beta" });
    expect(alpha).not.toHaveAttribute("title");
    expect(alpha).toHaveClass("select-none");
    expect(beta).toHaveAttribute("aria-selected", "true");
    fireEvent.click(alpha);
    expect(alpha).toHaveAttribute("aria-selected", "true");
    act(() => {
      useTreeStore.setState({ tree: [{ type: "folder", relPath: "folder", name: "folder", children: [{ ...notes[0], title: "Renamed" }, notes[1]] }] });
    });
    expect(screen.getByRole("tab", { name: "Renamed" })).toHaveAttribute("aria-label", "Renamed");
    const close = screen.getByRole("button", { name: "Renamed sekmesini kapat" });
    fireEvent.focus(close);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Renamed sekmesini kapatCtrl+W");
    expect(close).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
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
