import { createElement } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useThemeMode } from "@/hooks/useThemeMode";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";

const settings: Settings = {
  rootDir: null,
  theme: "system",
  language: null,
  sidebarWidth: 260,
  sidebarVisible: true,
  openTabs: [],
  activeTab: null,
  expandedFolders: [],
};

function ModeDisplay() {
  const mode = useThemeMode();
  return createElement("span", null, mode);
}

let onChange: ((event: MediaQueryListEvent) => void) | undefined;
let media: MediaQueryList;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  useSettingsStore.setState({ settings, status: "ready" });
  media = {
    matches: false,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((_type, listener) => { onChange = listener as (event: MediaQueryListEvent) => void; }),
    removeEventListener: vi.fn((_type, listener) => {
      if (onChange === listener) onChange = undefined;
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => media));
});

afterEach(() => {
  vi.unstubAllGlobals();
  onChange = undefined;
});

describe("useThemeMode", () => {
  it("follows system changes and removes the listener on unmount", () => {
    const view = render(createElement(ModeDisplay));
    expect(screen.getByText("light")).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("dark");

    act(() => {
      Object.defineProperty(media, "matches", { value: true, configurable: true });
      onChange?.({ matches: true } as MediaQueryListEvent);
    });
    expect(screen.getByText("dark")).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("htnote.themeMode")).toBe("dark");

    view.unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(onChange).toBeUndefined();
  });

  it("switches to an explicit mode and stops following system changes", () => {
    render(createElement(ModeDisplay));
    act(() => useSettingsStore.setState({ settings: { ...settings, theme: "dark" } }));
    expect(screen.getByText("dark")).toBeInTheDocument();
    expect(onChange).toBeUndefined();
    expect(document.documentElement).toHaveClass("dark");
  });

  it("uses the loaded setting instead of a stale cached mode on first render", () => {
    localStorage.setItem("htnote.themeMode", "dark");
    document.documentElement.classList.add("dark");
    useSettingsStore.setState({ settings: { ...settings, theme: "light" } });

    render(createElement(ModeDisplay));

    expect(screen.getByText("light")).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("htnote.themeMode")).toBe("light");
  });
});
