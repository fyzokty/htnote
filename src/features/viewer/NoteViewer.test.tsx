import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));

import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import { NoteViewer } from "@/features/viewer/NoteViewer";
import { installBridgeHost, resetBridgeHostForTests } from "@/features/viewer/bridgeHost";
import { NOTE_IFRAME_SANDBOX, initNoteOrigin, noteUrl } from "@/lib/noteUrl";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";

const notes = [
  { type: "note" as const, id: "a", title: "Alpha", relPath: "Alpha", isFavorite: false, tags: [], updatedAt: "2026-01-01T00:00:00Z" },
  { type: "note" as const, id: "b", title: "Beta", relPath: "Beta", isFavorite: false, tags: [], updatedAt: "2026-01-01T00:00:00Z" },
];
const NOTE_ORIGIN = "http://127.0.0.1:54321";

beforeEach(() => {
  initNoteOrigin(NOTE_ORIGIN);
  resetBridgeHostForTests();
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  useTreeStore.setState({ tree: notes });
  useTabsStore.getState().openNote("a");
  useUiStore.setState({ exportBusy: false, toasts: [] });
  useSettingsStore.setState({ settings: null });
  vi.mocked(save).mockReset();
  vi.mocked(revealItemInDir).mockReset();
});

describe("NoteViewer", () => {
  it("uses the exact isolated iframe attributes and loads from the note protocol", async () => {
    render(<NoteViewer />);
    const frame = await screen.findByTitle("Alpha") as HTMLIFrameElement;
    expect(NOTE_IFRAME_SANDBOX).toBe("allow-scripts allow-forms allow-same-origin allow-modals");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-forms allow-same-origin allow-modals");
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(frame).not.toHaveAttribute("srcdoc");
    expect(frame).toHaveAttribute("src", noteUrl("a"));
  });

  it("keeps the same iframe node across tab switches", async () => {
    render(<NoteViewer />);
    const first = await screen.findByTitle("Alpha");
    act(() => useTabsStore.getState().openNote("b"));
    await screen.findByTitle("Beta");
    expect(screen.getByTitle("Alpha")).toBe(first);
    act(() => useTabsStore.getState().activate("a"));
    await waitFor(() => expect(screen.getByTitle("Alpha")).toBe(first));
  });

  it("shows the not-found state for an active missing note", () => {
    useTreeStore.setState({ tree: [] });
    render(<NoteViewer />);
    expect(screen.getByText("Not bulunamadı")).toBeInTheDocument();
    expect(screen.queryByTitle("Alpha")).not.toBeInTheDocument();
  });

  it("registers mounted iframe windows and removes them on unmount", async () => {
    const dispose = installBridgeHost();
    const viewer = render(<NoteViewer />);
    const frame = await screen.findByTitle("Alpha") as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    try {
      window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin: NOTE_ORIGIN, data: { type: "HTNOTE_READY" } }));
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "HTNOTE_THEME" }), NOTE_ORIGIN);
      viewer.unmount();
      post.mockClear();
      window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin: NOTE_ORIGIN, data: { type: "HTNOTE_READY" } }));
      expect(post).not.toHaveBeenCalled();
    } finally {
      dispose();
      post.mockRestore();
    }
  });

  it("shows enabled print PDF outside Windows", () => {
    const platform = Object.getOwnPropertyDescriptor(navigator, "platform");
    Object.defineProperty(navigator, "platform", { configurable: true, value: "Linux" });
    try {
      render(<NoteViewer />);
      fireEvent.click(screen.getByRole("button", { name: "Dışa Aktar" }));
      expect(screen.getByRole("menuitem", { name: "Yazdır / PDF Olarak Kaydet" })).toBeEnabled();
      expect(screen.getByRole("menuitem", { name: "Tek dosya HTML" })).toBeEnabled();
      expect(screen.getByRole("menuitem", { name: "ZIP paketi" })).toBeEnabled();
    } finally {
      if (platform) Object.defineProperty(navigator, "platform", platform);
    }
  });

  it("keeps the Windows PDF export label and action", () => {
    const platform = Object.getOwnPropertyDescriptor(navigator, "platform");
    Object.defineProperty(navigator, "platform", { configurable: true, value: "Win32" });
    try {
      render(<NoteViewer />);
      fireEvent.click(screen.getByRole("button", { name: "Dışa Aktar" }));
      expect(screen.getByRole("menuitem", { name: "PDF" })).toBeEnabled();
    } finally {
      if (platform) Object.defineProperty(navigator, "platform", platform);
    }
  });

  it("prints the ready note frame on Linux without opening a save dialog", async () => {
    const platform = Object.getOwnPropertyDescriptor(navigator, "platform");
    Object.defineProperty(navigator, "platform", { configurable: true, value: "Linux" });
    const dispose = installBridgeHost();
    try {
      render(<NoteViewer />);
      const frame = await screen.findByTitle("Alpha") as HTMLIFrameElement;
      const post = vi.spyOn(frame.contentWindow!, "postMessage");
      window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin: NOTE_ORIGIN, data: { type: "HTNOTE_READY" } }));
      fireEvent.click(screen.getByRole("button", { name: "Dışa Aktar" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Yazdır / PDF Olarak Kaydet" }));
      await waitFor(() => expect(post).toHaveBeenCalledWith({ type: "HTNOTE_PRINT" }, NOTE_ORIGIN));
      expect(save).not.toHaveBeenCalled();
      post.mockRestore();
    } finally {
      dispose();
      if (platform) Object.defineProperty(navigator, "platform", platform);
    }
  });

  it("locks the button during export and offers reveal on success", async () => {
    useSettingsStore.setState({ settings: { rootDir: null, lastExportDir: null, theme: "system", language: "tr", sidebarWidth: 260, sidebarVisible: true, editorSplitRatio: 50, editorLivePreview: true, backlinksExpanded: true, openTabs: [], activeTab: null, expandedFolders: [], onboardingDone: false } });
    vi.mocked(save).mockResolvedValue("C:\\Exports\\Alpha.html");
    vi.mocked(revealItemInDir).mockResolvedValue();
    let finish: (result: { warnings: string[] }) => void = () => {};
    mockIPC((command) => command === "get_backlinks" || command === "get_broken_links" ? [] : command === "update_settings" ? useSettingsStore.getState().settings
      : command === "export_single_html" ? new Promise<{ warnings: string[] }>((resolve) => { finish = resolve; }) : undefined);
    render(<NoteViewer />);
    fireEvent.click(screen.getByRole("button", { name: "Dışa Aktar" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Tek dosya HTML" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Dışa aktarılıyor…" })).toBeDisabled());
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: "Alpha.html" }));
    await act(async () => finish({ warnings: [] }));
    expect(useUiStore.getState().toasts).toEqual(expect.arrayContaining([expect.objectContaining({ messageKey: "export.exported" })]));
    act(() => useUiStore.getState().toasts.find((toast) => toast.messageKey === "export.exported")?.action?.onClick());
    expect(revealItemInDir).toHaveBeenCalledWith("C:\\Exports\\Alpha.html");
  });
});
