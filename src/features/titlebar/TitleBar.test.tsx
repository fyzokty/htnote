import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TitleBar } from "@/features/titlebar/TitleBar";
import { MAXIMIZE_STATE_EVENT } from "@/lib/events";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

type Handler<T> = (event: { payload: T }) => void;

const windowMock = vi.hoisted(() => ({
  maximized: false,
  focused: true,
  resized: null as null | Handler<unknown>,
  focusChanged: null as null | Handler<boolean>,
  events: new Map<string, Handler<unknown>>(),
  minimize: vi.fn().mockResolvedValue(undefined),
  toggleMaximize: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: windowMock.minimize,
    toggleMaximize: windowMock.toggleMaximize,
    close: windowMock.close,
    destroy: windowMock.destroy,
    isMaximized: () => Promise.resolve(windowMock.maximized),
    isFocused: () => Promise.resolve(windowMock.focused),
    onResized: (handler: Handler<unknown>) => { windowMock.resized = handler; return Promise.resolve(() => {}); },
    onFocusChanged: (handler: Handler<boolean>) => { windowMock.focusChanged = handler; return Promise.resolve(() => {}); },
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: Handler<unknown>) => { windowMock.events.set(event, handler); return Promise.resolve(() => {}); },
}));

const notes = [{ type: "note" as const, id: "a", title: "Alpha", relPath: "Alpha", isFavorite: false, tags: [], updatedAt: "" }];
const platformDescriptor = Object.getOwnPropertyDescriptor(navigator, "platform");
type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };

function setPlatform(value: string) {
  Object.defineProperty(navigator, "platform", { configurable: true, value });
}

async function renderTitleBar() {
  const view = render(<TitleBar />);
  await act(async () => { await Promise.resolve(); });
  return view;
}

beforeEach(() => {
  windowMock.maximized = false;
  windowMock.focused = true;
  windowMock.resized = null;
  windowMock.focusChanged = null;
  windowMock.events.clear();
  for (const fn of [windowMock.minimize, windowMock.toggleMaximize, windowMock.close, windowMock.destroy]) fn.mockClear();
  (window as TauriWindow).__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } } };
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  useSettingsStore.setState({ settings: null, update: vi.fn().mockResolvedValue(undefined) });
  useTreeStore.setState({ tree: notes });
  useUiStore.setState({ searchOpen: false, sidebarVisible: true });
  useTabsStore.getState().openNote("a");
  setPlatform("Win32");
});

afterEach(() => {
  delete (window as TauriWindow).__TAURI_INTERNALS__;
  if (platformDescriptor) Object.defineProperty(navigator, "platform", platformDescriptor);
  else delete (navigator as { platform?: string }).platform;
});

describe("TitleBar", () => {
  it("shows Windows caption buttons with localized labels on Windows and Linux", async () => {
    for (const platform of ["Win32", "Linux x86_64"]) {
      setPlatform(platform);
      const { unmount } = await renderTitleBar();
      const group = screen.getByRole("group", { name: "Pencere denetimleri" });
      expect(within(group).getAllByRole("button").map((button) => button.getAttribute("aria-label")))
        .toEqual(["Simge durumuna küçült", "Ekranı kapla", "Kapat"]);
      expect(screen.getByTestId("titlebar").querySelector(".htnote-titlebar-traffic-lights")).toBeNull();
      unmount();
    }
  });

  it("keeps the macOS traffic lights instead of drawing caption buttons", async () => {
    setPlatform("MacIntel");
    await renderTitleBar();
    expect(screen.queryByRole("group", { name: "Pencere denetimleri" })).not.toBeInTheDocument();
    expect(screen.getByTestId("titlebar").querySelector(".htnote-titlebar-traffic-lights")).toHaveAttribute("data-tauri-drag-region");
    expect(screen.getByTestId("titlebar-search")).toHaveTextContent("⌘⇧F");
  });

  it("swaps the maximize icon and label when the window size changes", async () => {
    await renderTitleBar();
    const maximize = screen.getByTestId("window-maximize");
    expect(maximize).toHaveAttribute("aria-label", "Ekranı kapla");
    expect(maximize.querySelector('[data-icon="maximize"]')).not.toBeNull();

    windowMock.maximized = true;
    await act(async () => { windowMock.resized?.({ payload: {} }); await Promise.resolve(); });
    expect(maximize).toHaveAttribute("aria-label", "Önceki boyuta getir");
    expect(maximize).toHaveAttribute("data-maximized", "true");
    expect(maximize.querySelector('[data-icon="restore"]')).not.toBeNull();

    windowMock.maximized = false;
    await act(async () => { windowMock.resized?.({ payload: {} }); await Promise.resolve(); });
    expect(maximize).toHaveAttribute("aria-label", "Ekranı kapla");
  });

  it("routes caption buttons to minimize, toggleMaximize and close (never destroy)", async () => {
    await renderTitleBar();
    fireEvent.click(screen.getByRole("button", { name: "Simge durumuna küçült" }));
    fireEvent.click(screen.getByRole("button", { name: "Ekranı kapla" }));
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(windowMock.minimize).toHaveBeenCalledOnce();
    expect(windowMock.toggleMaximize).toHaveBeenCalledOnce();
    expect(windowMock.close).toHaveBeenCalledOnce();
    expect(windowMock.destroy).not.toHaveBeenCalled();
  });

  it("opens the full-text search dialog from the search box with the registry shortcut", async () => {
    await renderTitleBar();
    const search = screen.getByRole("button", { name: "Tüm notlarda ara" });
    expect(search).toHaveTextContent("Ara…");
    expect(search).toHaveTextContent("Ctrl+Shift+F");
    fireEvent.click(search);
    expect(useUiStore.getState().searchOpen).toBe(true);
  });

  it("marks only empty areas as drag regions", async () => {
    await renderTitleBar();
    const header = screen.getByTestId("titlebar");
    const dragRegions = [...header.querySelectorAll("[data-tauri-drag-region]")];
    expect(header).toHaveAttribute("data-tauri-drag-region");
    expect(dragRegions).toEqual([header.querySelector(".htnote-tabbar"), screen.getByTestId("titlebar-drag-region")]);
    const interactive = [screen.getByRole("tablist"), ...screen.getAllByRole("tab"), ...screen.getAllByRole("button")];
    for (const element of interactive) {
      expect(element.closest("[data-tauri-drag-region]") === element).toBe(false);
      expect(element).not.toHaveAttribute("data-tauri-drag-region");
    }
  });

  it("toggles the sidebar from the title bar", async () => {
    await renderTitleBar();
    fireEvent.click(screen.getByRole("button", { name: "Kenar çubuğunu gizle" }));
    expect(useUiStore.getState().sidebarVisible).toBe(false);
    expect(screen.getByRole("button", { name: "Kenar çubuğunu göster" })).toBeInTheDocument();
  });

  it("mirrors native Snap Layouts hover state and dims when the window is inactive", async () => {
    await renderTitleBar();
    const maximize = screen.getByTestId("window-maximize");
    expect(maximize).toHaveAttribute("data-overlay-state", "idle");
    act(() => windowMock.events.get(MAXIMIZE_STATE_EVENT)?.({ payload: "hover" }));
    expect(maximize).toHaveAttribute("data-overlay-state", "hover");
    act(() => windowMock.events.get(MAXIMIZE_STATE_EVENT)?.({ payload: "unexpected" }));
    expect(maximize).toHaveAttribute("data-overlay-state", "hover");

    expect(screen.getByTestId("titlebar")).toHaveAttribute("data-window-focused", "true");
    act(() => windowMock.focusChanged?.({ payload: false }));
    expect(screen.getByTestId("titlebar")).toHaveAttribute("data-window-focused", "false");
  });

  it("does not touch the window API outside Tauri", async () => {
    delete (window as TauriWindow).__TAURI_INTERNALS__;
    await renderTitleBar();
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(windowMock.close).not.toHaveBeenCalled();
    expect(windowMock.resized).toBeNull();
  });
});
