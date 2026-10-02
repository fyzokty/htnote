import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SplitView } from "@/features/editor/SplitView";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";

const settings: Settings = {
  rootDir: null, lastExportDir: null, theme: "system", language: null, sidebarWidth: 260,
  sidebarVisible: true, editorSplitRatio: 35, editorLivePreview: true, backlinksExpanded: true,
  openTabs: [], activeTab: null, expandedFolders: [], onboardingDone: false,
};

beforeEach(() => {
  useSettingsStore.setState({ settings: { ...settings }, status: "ready" });
});

describe("SplitView", () => {
  it("ayarlar yüklenene kadar önizleme düğmesini devre dışı bırakır", () => {
    useSettingsStore.setState({ settings: null, status: "loading" });
    render(<SplitView editor={<div>Editör</div>}><div>Önizleme</div></SplitView>);
    const button = screen.getByRole("button", { name: "Canlı önizleme" });
    expect(button).toBeDisabled();
    act(() => useSettingsStore.setState({ settings: { ...settings }, status: "ready" }));
    expect(button).toBeEnabled();
  });

  it("kaydedilmiş oranı yükler ve sürükleme sonunda sınırlanmış oranı kaydeder", async () => {
    const patches: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "update_settings") {
        const patch = (args as { patch: Partial<Settings> }).patch;
        patches.push(patch);
        return { ...settings, ...patch };
      }
    });
    const view = render(<SplitView editor={<div>Editör</div>}><div>Önizleme</div></SplitView>);
    const separator = screen.getByRole("separator");
    expect(separator).toHaveAttribute("aria-valuenow", "35");
    Object.defineProperty(separator, "setPointerCapture", { value: vi.fn() });
    const container = separator.parentElement!;
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
    fireEvent.pointerDown(separator, { pointerId: 1 });
    fireEvent.pointerMove(separator, { clientX: 950, pointerId: 1 });
    expect(separator).toHaveAttribute("aria-valuenow", "80");
    fireEvent.pointerUp(separator, { pointerId: 1 });
    await waitFor(() => expect(patches).toContainEqual({ editorSplitRatio: 80 }));
    fireEvent.pointerDown(separator, { pointerId: 2 });
    fireEvent.pointerMove(separator, { clientX: -100, pointerId: 2 });
    expect(separator).toHaveAttribute("aria-valuenow", "20");
    fireEvent.pointerUp(separator, { pointerId: 2 });
    await waitFor(() => expect(patches).toContainEqual({ editorSplitRatio: 20 }));
    view.unmount();
  });

  it("canlı önizleme tercihini kaydeder ve editörü genişletir", async () => {
    const patches: unknown[] = [];
    mockIPC((command, args) => {
      if (command === "update_settings") {
        const patch = (args as { patch: Partial<Settings> }).patch;
        patches.push(patch);
        return { ...settings, ...patch };
      }
    });
    render(<SplitView editor={<div>Editör</div>}><div>Önizleme</div></SplitView>);
    fireEvent.click(screen.getByRole("button", { name: "Canlı önizleme" }));
    expect(screen.queryByText("Önizleme")).not.toBeInTheDocument();
    await waitFor(() => expect(patches).toContainEqual({ editorLivePreview: false }));
  });
});
