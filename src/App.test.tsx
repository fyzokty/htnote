import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import App from "@/App";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";

const defaults: Settings = {
  rootDir: null,
  theme: "system",
  language: null,
  sidebarWidth: 260,
  sidebarVisible: true,
  openTabs: [],
  activeTab: null,
  expandedFolders: [],
};

beforeEach(() => {
  useSettingsStore.setState({ settings: null, status: "idle" });
});

describe("App", () => {
  it("ayarlar yüklendikten sonra uygulama kabuğunu render eder", async () => {
    mockIPC((command) => command === "get_settings" ? defaults : undefined);
    render(<App />);
    expect(await screen.findByRole("heading", { name: "HTNote" })).toBeInTheDocument();
  });
});
