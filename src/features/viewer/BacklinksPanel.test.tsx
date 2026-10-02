import { mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { BacklinksPanel } from "@/features/viewer/BacklinksPanel";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";

beforeEach(() => {
  resetTabsStoreForTests();
  useSettingsStore.setState({ settings: {
    rootDir: null, lastExportDir: null, theme: "system", language: null, sidebarWidth: 260, sidebarVisible: true,
    editorSplitRatio: 50, editorLivePreview: true, backlinksExpanded: true,
    openTabs: [], activeTab: null, expandedFolders: [], onboardingDone: false,
  }, status: "ready" });
  mockIPC((command) => {
    if (command === "get_backlinks") return [{ id: "source", title: "Source", relPath: "Folder/Source", snippet: "surrounding link" }];
    if (command === "get_broken_links") return [{ targetId: "missing", text: "Lost" }];
    if (command === "update_settings") return { ...useSettingsStore.getState().settings, backlinksExpanded: false };
  });
});

describe("BacklinksPanel", () => {
  it("shows the count, opens sources and lists broken links", async () => {
    render(<BacklinksPanel id="target" saveRevision="" />);
    expect(await screen.findByText("Source")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Geri bağlantılar \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText("Kırık linkler")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Source"));
    expect(useTabsStore.getState().activeId).toBe("source");
  });

  it("hides details when collapsed", async () => {
    render(<BacklinksPanel id="target" saveRevision="" />);
    await screen.findByText("Source");
    fireEvent.click(screen.getByRole("button", { name: /Geri bağlantılar \(1\)/ }));
    expect(screen.getByRole("button", { name: /Geri bağlantılar \(1\)/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Source")).not.toBeInTheDocument();
  });
});
