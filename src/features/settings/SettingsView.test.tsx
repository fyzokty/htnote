import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveUnsaved } from "@/features/editor/unsavedGuard";
import { changeRootFlow } from "@/features/settings/changeRoot";
import { ipc } from "@/lib/ipc";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

import { SettingsView } from "./SettingsView";

vi.mock("@/features/editor/unsavedGuard", () => ({ resolveUnsaved: vi.fn() }));

const settings: Settings = {
  rootDir: "C:/Old", lastExportDir: null, theme: "system", language: null,
  sidebarWidth: 260, sidebarVisible: true, editorSplitRatio: 50, editorLivePreview: true,
  backlinksExpanded: true, openTabs: [], activeTab: null, expandedFolders: [], onboardingDone: true,
};

beforeEach(() => {
  vi.restoreAllMocks();
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  useSettingsStore.setState({ settings, status: "ready" });
  useUiStore.setState({ confirmDialog: null, trashCount: 0 });
  vi.spyOn(ipc, "getRootDir").mockResolvedValue("C:/Old");
  vi.spyOn(ipc, "appInfo").mockResolvedValue({ version: "0.1.0", platform: "windows" });
});

describe("SettingsView", () => {
  it("changes theme and language through settings", async () => {
    const update = vi.spyOn(ipc, "updateSettings").mockImplementation(async (patch) => ({ ...settings, ...patch }));
    render(<SettingsView />);
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "dark" } });
    await waitFor(() => expect(update).toHaveBeenCalledWith({ theme: "dark" }));
    fireEvent.change(screen.getByLabelText("Dil"), { target: { value: "en" } });
    await waitFor(() => expect(update).toHaveBeenCalledWith({ language: "en" }));
    fireEvent.change(screen.getByLabelText("Dil"), { target: { value: "system" } });
    await waitFor(() => expect(update).toHaveBeenCalledWith({ language: null }));
  });

  it("shows the storage path, warning and app version", async () => {
    render(<SettingsView />);
    expect(await screen.findByText("C:/Old")).toBeInTheDocument();
    expect(screen.getByText(/mevcut notlar taşınmaz/i)).toBeInTheDocument();
    expect(await screen.findByText("Sürüm 0.1.0")).toBeInTheDocument();
  });

  it("reveals the configured root folder", async () => {
    const reveal = vi.spyOn(ipc, "revealInExplorer").mockResolvedValue();
    render(<SettingsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Klasörde göster" }));
    expect(reveal).toHaveBeenCalledWith("C:/Old");
  });

  it("opens about links through the IPC wrapper", async () => {
    const openExternalUrl = vi.spyOn(ipc, "openExternalUrl").mockResolvedValue();
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "Lisans" }));
    expect(openExternalUrl).toHaveBeenCalledWith("https://github.com/fyzokty/htnote");
  });

  it("shows an error toast when the selected root is rejected", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(ipc, "pickDirectory").mockResolvedValue("C:/Invalid");
    vi.spyOn(useUiStore.getState(), "confirm").mockResolvedValue(true);
    vi.mocked(resolveUnsaved).mockResolvedValue({ resolved: new Set(), cancelled: false });
    vi.spyOn(ipc, "setRootDir").mockRejectedValue({ code: "NOT_A_FOLDER", message: "note package" });
    render(<SettingsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Değiştir…" }));
    await waitFor(() => expect(useUiStore.getState().toasts.slice(-1)[0]?.messageKey).toBe("errors.NOT_A_FOLDER"));
    expect(useSettingsStore.getState().settings?.rootDir).toBe("C:/Old");
  });
});

describe("changeRootFlow", () => {
  it("confirms, guards, closes tabs, switches root and refreshes", async () => {
    const order: string[] = [];
    vi.spyOn(ipc, "pickDirectory").mockImplementation(async () => { order.push("pick"); return "C:/New"; });
    vi.spyOn(useUiStore.getState(), "confirm").mockImplementation(async () => { order.push("confirm"); return true; });
    vi.mocked(resolveUnsaved).mockImplementation(async () => { order.push("guard"); return { resolved: new Set(["a"]), cancelled: false }; });
    useTabsStore.setState({ tabs: [{ noteId: "a", doc: { dirty: false } as never }] });
    vi.spyOn(useTabsStore.getState(), "close").mockImplementation(async () => { order.push("close"); return true; });
    vi.spyOn(ipc, "setRootDir").mockImplementation(async () => { order.push("set"); return { ...settings, rootDir: "C:/New" }; });
    vi.spyOn(useTreeStore.getState(), "refresh").mockImplementation(async () => { order.push("refresh"); });
    vi.spyOn(ipc, "listTrash").mockImplementation(async () => { order.push("trash"); return []; });
    expect(await changeRootFlow("C:/Old")).toBe(true);
    expect(order).toEqual(["pick", "confirm", "guard", "close", "set", "refresh", "trash"]);
  });

  it("stops when selection, confirmation or unsaved guard is cancelled", async () => {
    const pick = vi.spyOn(ipc, "pickDirectory").mockResolvedValue(null);
    const confirm = vi.spyOn(useUiStore.getState(), "confirm").mockResolvedValue(false);
    const setRoot = vi.spyOn(ipc, "setRootDir");
    expect(await changeRootFlow("C:/Old")).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    pick.mockResolvedValue("C:/New");
    expect(await changeRootFlow("C:/Old")).toBe(false);
    confirm.mockResolvedValue(true);
    vi.mocked(resolveUnsaved).mockResolvedValue({ resolved: new Set(), cancelled: true });
    expect(await changeRootFlow("C:/Old")).toBe(false);
    expect(setRoot).not.toHaveBeenCalled();
  });
});
