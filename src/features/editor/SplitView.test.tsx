import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SplitView } from "@/features/editor/SplitView";
import { CodeEditor } from "@/features/editor/CodeEditor";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";

const settings: Settings = {
  rootDir: null, lastExportDir: null, theme: "system", language: null, sidebarWidth: 260,
  sidebarVisible: true, tabSizing: "fixed", editorSplitRatio: 35, editorLivePreview: true, backlinksExpanded: true,
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
    expect(view.container.querySelector(".htnote-split-view")).toHaveStyle({ minHeight: 0, overflow: "hidden" });
    expect(view.container.querySelector(".htnote-split-editor")).toHaveStyle({ display: "flex", minHeight: 0, overflow: "hidden" });
    const separator = screen.getByRole("separator");
    expect(separator).toHaveAttribute("aria-valuenow", "35");
    Object.defineProperty(separator, "setPointerCapture", { value: vi.fn() });
    const container = separator.parentElement!;
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
    fireEvent.pointerDown(separator, { pointerId: 1 });
    expect(separator).toHaveAttribute("data-dragging", "true");
    fireEvent.pointerMove(separator, { clientX: 950, pointerId: 1 });
    expect(separator).toHaveAttribute("aria-valuenow", "80");
    fireEvent.pointerUp(separator, { pointerId: 1 });
    expect(separator).toHaveAttribute("data-dragging", "false");
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
    const toggle = screen.getByRole("button", { name: "Canlı önizleme" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Önizleme")).not.toBeInTheDocument();
    await waitFor(() => expect(patches).toContainEqual({ editorLivePreview: false }));
    expect(screen.getByText("Editör").parentElement).toHaveStyle({ width: "100%" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(patches).toContainEqual({ editorLivePreview: true }));
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("places the preview toggle alongside the tabs with no extra split toolbar", async () => {
    const update = vi.spyOn(useSettingsStore.getState(), "update").mockResolvedValue(settings);
    render(<SplitView editor={(toggle) => <CodeEditor html="<p>HTML</p>" css="" js="" onChange={vi.fn()} toolbarActions={toggle} />} />);
    const toggle = screen.getByTestId("live-preview-toggle");
    expect(screen.getAllByTestId("live-preview-toggle")).toHaveLength(1);
    expect(toggle.closest(".htnote-code-bar")).toContainElement(screen.getByRole("tablist"));
    expect(screen.getByRole("tablist")).not.toContainElement(toggle);
    fireEvent.click(toggle);
    expect(update).toHaveBeenCalledExactlyOnceWith({ editorLivePreview: false });
  });

  it("keeps keyboard resizing clamped and persists arrow-key changes", async () => {
    const update = vi.spyOn(useSettingsStore.getState(), "update").mockResolvedValue(settings);
    useSettingsStore.setState({ settings: { ...settings, editorSplitRatio: 79 } });
    render(<SplitView editor={<div>Editör</div>} />);
    const separator = screen.getByRole("separator");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "80");
    expect(update).toHaveBeenLastCalledWith({ editorSplitRatio: 80 });
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "80");
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator).toHaveAttribute("aria-valuenow", "79");
    expect(update).toHaveBeenLastCalledWith({ editorSplitRatio: 79 });
  });
});
