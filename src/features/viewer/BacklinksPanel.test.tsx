import { mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { BacklinksPanel } from "@/features/viewer/BacklinksPanel";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";

beforeEach(() => {
  resetTabsStoreForTests();
  useSettingsStore.setState({ settings: {
    rootDir: null, lastExportDir: null, theme: "system", motion: "system", language: null, sidebarWidth: 260, sidebarVisible: true, tabSizing: "fixed",
    contentWidth: "comfortable", editorSplitRatio: 50, editorLivePreview: true, backlinksExpanded: true,
    openTabs: [], activeTab: null, expandedFolders: [], onboardingDone: false,
  }, status: "ready" });
  mockIPC((command) => {
    if (command === "get_backlinks") return [{ id: "source", title: "Source", relPath: "Folder/Source", snippet: "surrounding link" }];
    if (command === "get_broken_links") return [{ targetId: "missing", text: "Lost" }];
    if (command === "update_settings") return { ...useSettingsStore.getState().settings, backlinksExpanded: false };
  });
});

describe("BacklinksPanel", () => {
  it("shows the count, opens sources and lists broken links when expanded", async () => {
    render(<BacklinksPanel id="target" saveRevision="" />);
    expect(await screen.findByText("Source")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /Geri bağlantılar \(1\)/ });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-controls", "backlinks-content-target");
    expect(screen.getByText("Kırık linkler")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Source"));
    expect(useTabsStore.getState().activeId).toBe("source");
  });

  it("toggles collapse state and aria-expanded", async () => {
    const { container } = render(<BacklinksPanel id="target" saveRevision="" />);
    await screen.findByText("Source");
    const button = screen.getByRole("button", { name: /Geri bağlantılar \(1\)/ });
    const region = container.querySelector("#backlinks-content-target");

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(region).not.toHaveAttribute("inert");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(region).toHaveAttribute("inert");
  });
});
