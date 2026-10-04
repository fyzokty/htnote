import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import App from "@/App";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests } from "@/stores/treeStore";

const defaults: Settings = {
  rootDir: null, lastExportDir: null,
  theme: "system",
  language: "tr",
  sidebarWidth: 260, editorSplitRatio: 50, editorLivePreview: true, backlinksExpanded: true,
  sidebarVisible: true, tabSizing: "fixed", contentWidth: "comfortable",
  openTabs: [],
  activeTab: null,
  expandedFolders: [],
  onboardingDone: false,
};

beforeEach(() => {
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  useSettingsStore.setState({ settings: null, status: "idle" });
});

describe("App", () => {
  it("opens, activates and toggles settings and trash as tabs with sidebar highlights", async () => {
    mockIPC((command) => {
      if (command === "get_settings") return defaults;
      if (["get_note_tree", "list_drafts", "list_trash"].includes(command)) return [];
      if (command === "get_root_dir") return "C:/Notes";
      if (command === "app_info") return { version: "0.1.0", platform: "windows" };
      return undefined;
    });
    render(<App />);
    const settings = await screen.findByRole("button", { name: "Ayarlar" });
    await waitFor(() => expect(useTabsStore.getState().restored).toBe(true));
    fireEvent.click(settings);
    expect(screen.getByRole("tab", { name: "Ayarlar" })).toHaveAttribute("aria-selected", "true");
    expect(settings).toHaveAttribute("aria-pressed", "true");
    const trash = screen.getByTestId("trash");
    fireEvent.click(trash);
    expect(screen.getByRole("tab", { name: "Çöp kutusu" })).toHaveAttribute("aria-selected", "true");
    expect(trash).toHaveAttribute("aria-pressed", "true");
    expect(settings).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(settings);
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Ayarlar" })).toBeInTheDocument();
    fireEvent.click(settings);
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Ayarlar" })).not.toBeInTheDocument());
    expect(trash).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(trash);
    await waitFor(() => expect(screen.queryByRole("tab")).not.toBeInTheDocument());
    expect(screen.getByText("Bir not seçin veya yeni not oluşturun")).toBeInTheDocument();
  });

  it("ayarlar yüklendikten sonra uygulama kabuğunu render eder", async () => {
    mockIPC((command) => command === "get_settings" ? defaults : undefined);
    render(<App />);
    const title = await screen.findByRole("heading", { name: "HTNote" });
    expect(title).toHaveClass("select-none");
    expect(title.closest("main")).toHaveClass("select-none");
  });

  it("dil ayarı değiştiğinde görünen metinleri günceller", async () => {
    mockIPC((command) => {
      if (command === "get_settings") return defaults;
      if (command === "update_settings") return { ...defaults, language: "en" };
      if (command === "get_root_dir") return "C:/Notes";
      if (command === "app_info") return { version: "0.1.0", platform: "windows" };
      return undefined;
    });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Ayarlar" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Dil" }), { target: { value: "en" } });
    expect(await screen.findByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Language" })).toBeInTheDocument();
  });
});
