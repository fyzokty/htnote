import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import App from "@/App";
import i18n from "@/i18n";
import { initNoteOrigin } from "@/lib/noteUrl";
import type { Settings, TreeNode } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";

const defaults: Settings = {
  rootDir: null, lastExportDir: null,
  theme: "system", motion: "system",
  language: "tr",
  sidebarWidth: 260, editorSplitRatio: 50, editorLivePreview: true, autoSave: true, backlinksExpanded: true,
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
  it("keeps the static splash until settings and the initial tree are ready, then restores tabs", async () => {
    let finish!: (settings: Settings) => void;
    const pending = new Promise<Settings>((resolve) => { finish = resolve; });
    let finishTree!: (tree: TreeNode[]) => void;
    const pendingTree = new Promise<TreeNode[]>((resolve) => { finishTree = resolve; });
    initNoteOrigin("http://127.0.0.1:4123");
    const noteId = "11111111-1111-4111-8111-111111111111";
    const note: TreeNode = { type: "note", id: noteId, title: "Açık not", relPath: "Açık not", isFavorite: false, tags: [], updatedAt: "2026-01-01T00:00:00Z" };
    mockIPC((command) => {
      if (command === "get_settings") return pending;
      // Rust ilk tarama bitene kadar get_note_tree yanıtını bekletir.
      if (command === "get_note_tree") return pendingTree;
      if (["list_drafts", "list_trash", "get_backlinks", "get_broken_links"].includes(command)) return [];
      if (command === "read_note") return new Promise(() => {});
      return undefined;
    });
    const splash = document.createElement("div");
    splash.id = "htnote-splash";
    document.body.append(splash);
    try {
      const { container } = render(<App />);
      expect(container).toBeEmptyDOMElement();
      expect(splash.dataset.state).toBeUndefined();
      await act(async () => { finish({ ...defaults, openTabs: [noteId], activeTab: noteId }); });
      await screen.findByRole("heading", { name: "HTNote" });
      // Kabuk açılış ekranının altında hazırlanır; tarama sürerken sekmeler kapatılmaz ve ekran kalkmaz.
      expect(splash.dataset.state).toBeUndefined();
      expect(useTabsStore.getState().restored).toBe(false);
      await act(async () => { finishTree([note]); });
      await waitFor(() => expect(splash.dataset.state).toBe("hidden"));
      await waitFor(() => expect(useTabsStore.getState().restored).toBe(true));
      expect(useTabsStore.getState().tabs.map((tab) => tab.noteId)).toEqual([noteId]);
      expect(useTabsStore.getState().activeId).toBe(noteId);
      expect(localStorage.getItem("htnote.language")).toBe("tr");
    } finally {
      splash.remove();
      localStorage.removeItem("htnote.language");
    }
  });

  it("hides the splash when the initial tree fails to load", async () => {
    mockIPC((command) => {
      if (command === "get_settings") return defaults;
      if (command === "get_note_tree") throw new Error("scan failed");
      if (["list_drafts", "list_trash"].includes(command)) return [];
      return undefined;
    });
    const splash = document.createElement("div");
    splash.id = "htnote-splash";
    document.body.append(splash);
    try {
      render(<App />);
      await waitFor(() => expect(useTreeStore.getState().status).toBe("error"));
      await waitFor(() => expect(splash.dataset.state).toBe("hidden"));
    } finally {
      splash.remove();
    }
  });

  it("hides the splash and displays the settings error on failure", async () => {
    mockIPC((command) => {
      if (command === "get_settings") throw new Error("settings unavailable");
      return undefined;
    });
    const splash = document.createElement("div");
    splash.id = "htnote-splash";
    document.body.append(splash);
    try {
      render(<App />);
      await waitFor(() => expect(useSettingsStore.getState().status).toBe("error"));
      expect(screen.getByRole("main")).toHaveTextContent(i18n.t("errors.settingsLoad"));
      expect(splash.dataset.state).toBe("hidden");
    } finally {
      splash.remove();
    }
  });
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
    expect(title).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("combobox", { name: "Dil" }));
    fireEvent.click(screen.getByRole("option", { name: "İngilizce" }));
    expect(await screen.findByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Language" })).toBeInTheDocument();
    expect(localStorage.getItem("htnote.language")).toBe("en");
    localStorage.removeItem("htnote.language");
  });
});
