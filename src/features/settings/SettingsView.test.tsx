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
  sidebarWidth: 260, sidebarVisible: true, tabSizing: "fixed", contentWidth: "comfortable", editorSplitRatio: 50, editorLivePreview: true,
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
  it("changes tab sizing through the shared segmented control, including keyboard selection", async () => {
    const update = vi.spyOn(ipc, "updateSettings").mockImplementation(async (patch) => ({ ...settings, ...patch }));
    render(<SettingsView />);
    expect(screen.getByRole("group", { name: "Sekme boyutu" })).toHaveClass("htnote-segmented-control");
    expect(screen.getByRole("button", { name: "Sabit genişlik" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Başlığa göre" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ tabSizing: "fit" }));
    expect(screen.getByRole("button", { name: "Başlığa göre" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(screen.getByRole("button", { name: "Başlığa göre" }), { key: "ArrowLeft" });
    await waitFor(() => expect(update).toHaveBeenCalledWith({ tabSizing: "fixed" }));
  });

  it("changes content width through the segmented control", async () => {
    const update = vi.spyOn(ipc, "updateSettings").mockImplementation(async (patch) => ({ ...settings, ...patch }));
    render(<SettingsView />);
    expect(screen.getByRole("group", { name: "İçerik genişliği" })).toHaveClass("htnote-segmented-control");
    expect(screen.getByRole("button", { name: "Rahat" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Dar" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ contentWidth: "narrow" }));
    fireEvent.click(screen.getByRole("button", { name: "Tam genişlik" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ contentWidth: "full" }));
  });

  it("changes theme and language through settings", async () => {
    const update = vi.spyOn(ipc, "updateSettings").mockImplementation(async (patch) => ({ ...settings, ...patch }));
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "Koyu" }));
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

  it("shows an error toast without confirming or closing tabs when the selected root is rejected", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(ipc, "pickDirectory").mockResolvedValue("C:/Invalid");
    vi.spyOn(useUiStore.getState(), "confirm").mockResolvedValue(true);
    vi.spyOn(ipc, "validateRootDir").mockRejectedValue({ code: "NOT_A_FOLDER", message: "note package" });
    const close = vi.spyOn(useTabsStore.getState(), "close");
    vi.mocked(resolveUnsaved).mockResolvedValue({ resolved: new Set(), cancelled: false });
    const setRoot = vi.spyOn(ipc, "setRootDir");
    render(<SettingsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Değiştir…" }));
    await waitFor(() => expect(useUiStore.getState().toasts.slice(-1)[0]?.messageKey).toBe("errors.NOT_A_FOLDER"));
    expect(useUiStore.getState().confirm).not.toHaveBeenCalled();
    expect(resolveUnsaved).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(setRoot).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().settings?.rootDir).toBe("C:/Old");
  });
});

describe("changeRootFlow", () => {
  it("confirms, guards, closes tabs, switches root and refreshes", async () => {
    const order: string[] = [];
    vi.spyOn(ipc, "pickDirectory").mockImplementation(async () => { order.push("pick"); return "C:/New"; });
    vi.spyOn(ipc, "validateRootDir").mockImplementation(async () => { order.push("validate"); });
    vi.spyOn(useUiStore.getState(), "confirm").mockImplementation(async () => { order.push("confirm"); return true; });
    vi.mocked(resolveUnsaved).mockImplementation(async () => { order.push("guard"); return { resolved: new Set(["a"]), cancelled: false }; });
    useTabsStore.setState({ tabs: [{ noteId: "a", doc: { dirty: false } as never }] });
    vi.spyOn(useTabsStore.getState(), "close").mockImplementation(async () => { order.push("close"); return true; });
    vi.spyOn(ipc, "setRootDir").mockImplementation(async () => { order.push("set"); return { ...settings, rootDir: "C:/New" }; });
    vi.spyOn(useTreeStore.getState(), "refresh").mockImplementation(async () => { order.push("refresh"); });
    vi.spyOn(ipc, "listTrash").mockImplementation(async () => { order.push("trash"); return []; });
    expect(await changeRootFlow("C:/Old")).toBe(true);
    expect(order).toEqual(["pick", "validate", "confirm", "guard", "close", "set", "refresh", "trash"]);
    expect(useUiStore.getState().confirm).toHaveBeenCalledWith("settings.changeRootTitle", "settings.changeRootWarning", expect.any(Object), { variant: "primary", labelKey: "ui.confirm" });
  });

  it("stops when selection, confirmation or unsaved guard is cancelled", async () => {
    const pick = vi.spyOn(ipc, "pickDirectory").mockResolvedValue(null);
    vi.spyOn(ipc, "validateRootDir").mockResolvedValue();
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

  it("validates the selected root before confirmation or closing tabs", async () => {
    const order: string[] = [];
    vi.spyOn(ipc, "pickDirectory").mockResolvedValue("C:/Invalid");
    vi.spyOn(ipc, "validateRootDir").mockImplementation(async () => { order.push("validate"); throw new Error("invalid root"); });
    vi.spyOn(useUiStore.getState(), "confirm").mockImplementation(async () => { order.push("confirm"); return true; });
    vi.spyOn(useTabsStore.getState(), "close").mockImplementation(async () => { order.push("close"); return true; });
    await expect(changeRootFlow("C:/Old")).rejects.toThrow("invalid root");
    expect(order).toEqual(["validate"]);
  });
});

it("copies the root path and retains tag color settings inside the appearance card", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const { container } = render(<SettingsView />);
  await screen.findByText("C:/Old");
  fireEvent.click(screen.getByRole("button", { name: "Depolama yolunu kopyala" }));
  expect(writeText).toHaveBeenCalledWith("C:/Old");
  expect(container.querySelector("#settings-tag-colors")?.closest("section")).toHaveAttribute("aria-labelledby", "settings-appearance");
});
