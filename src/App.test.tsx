import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import App from "@/App";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";

const defaults: Settings = {
  rootDir: null,
  theme: "system",
  language: "tr",
  sidebarWidth: 260,
  sidebarVisible: true,
  openTabs: [],
  activeTab: null,
  expandedFolders: [],
  onboardingDone: false,
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

  it("dil ayarı değiştiğinde görünen metinleri günceller", async () => {
    mockIPC((command) => {
      if (command === "get_settings") return defaults;
      if (command === "update_settings") return { ...defaults, language: "en" };
      return undefined;
    });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "İngilizce" }));
    expect(await screen.findByText("No notes yet — start with + Note")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
  });
});
