import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));

import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import { NoteViewer } from "@/features/viewer/NoteViewer";
import { handleExternalChanges } from "@/features/editor/externalChange";
import { installBridgeHost, requestHighlight, resetBridgeHostForTests } from "@/features/viewer/bridgeHost";
import type { NoteData, Settings } from "@/lib/types";
import { NOTE_IFRAME_SANDBOX, initNoteOrigin, noteUrl } from "@/lib/noteUrl";
import { ipc } from "@/lib/ipc";
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
  vi.spyOn(ipc, "getNoteTree").mockResolvedValue(notes);
  vi.mocked(save).mockReset();
  vi.mocked(revealItemInDir).mockReset();
});

describe("NoteViewer", () => {
  it("keeps the editing frame laid out and restores interaction on return to view", async () => {
    mockIPC((command) => command === "get_backlinks" || command === "get_broken_links" ? [] : undefined);
    render(<NoteViewer />);
    const frame = await screen.findByTitle("Alpha") as HTMLIFrameElement;
    const container = frame.parentElement!;
    expect(container).toHaveAttribute("data-note-id", "a");
    expect(container).toHaveAttribute("data-revision", "0:0");
    fireEvent.load(frame);
    expect(container).toHaveAttribute("data-loaded-revision", "0:0");
    const base = { html: '<main id="htnote-content"><p>Content</p></main>', css: null, js: null, contentHash: "initial" };
    act(() => useTabsStore.getState().enterEdit("a", base, "visual", true));
    expect(screen.getByTitle("Alpha")).toBe(frame);
    expect(container).not.toHaveAttribute("hidden");
    expect(container).toHaveClass("absolute", "invisible", "pointer-events-none");
    expect(container).toHaveAttribute("inert");
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(container).toHaveAttribute("data-editing", "true");
    const initialSrc = frame.src;
    act(() => {
      useTabsStore.getState().markSaving("a");
      useTabsStore.getState().saveSucceeded("a", { ...base, contentHash: "saved" });
    });
    expect(frame.src).not.toBe(initialSrc);
    expect(container.dataset.revision).toBe(new URL(frame.src).searchParams.get("revision"));
    expect(container).toHaveAttribute("data-loaded-revision", "0:0");
    act(() => useTabsStore.getState().cancelEdit("a"));
    expect(screen.getByTitle("Alpha")).toBe(frame);
    expect(container).not.toHaveAttribute("hidden");
    expect(container).not.toHaveAttribute("inert");
    expect(container).toHaveAttribute("aria-hidden", "false");
    expect(container).not.toHaveClass("invisible", "pointer-events-none", "absolute");
    expect(container).toHaveAttribute("data-editing", "false");
    expect(container).toHaveAttribute("data-saving", "false");
    fireEvent.load(frame);
    expect(container.dataset.loadedRevision).toBe(container.dataset.revision);
  });

  it("navigates the cached frame on external changes and waits for the new document's bridge", async () => {
    const disk: NoteData = {
      metadata: {
        id: "a", title: "Alpha", createdAt: "", updatedAt: "", isFavorite: false,
        tags: [], hasCustomCss: false, hasCustomJs: false,
      },
      html: "External update", css: null, js: null, contentHash: "external-hash",
    };
    mockIPC((command) => command === "read_note" ? disk : []);
    const dispose = installBridgeHost();
    const viewer = render(<NoteViewer />);
    const frame = await screen.findByTitle("Alpha") as HTMLIFrameElement;
    const initialUrl = frame.src;
    const frameWindow = frame.contentWindow!;
    let post = vi.spyOn(frameWindow, "postMessage");
    const ready = () => window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow, origin: NOTE_ORIGIN, data: { type: "HTNOTE_READY" },
    }));
    try {
      ready();
      fireEvent.load(frame);
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      act(() => useTabsStore.getState().openSpecial("settings"));
      await act(() => handleExternalChanges({
        changedNoteIds: ["a"], removedNoteIds: [], treeChanged: false, trashChanged: false,
      }));
      expect(screen.getByTitle("Alpha")).toBe(frame);
      expect(frame.src).not.toBe(initialUrl);
      expect(new URL(frame.src).pathname).toBe("/a/");
      expect(screen.getByRole("progressbar", { hidden: true })).toBeInTheDocument();
      act(() => useTabsStore.getState().openNote("a"));
      expect(screen.getByTitle("Alpha")).toBe(frame);
      // jsdom creates a new Window object for src navigation.
      post.mockRestore();
      post = vi.spyOn(frame.contentWindow!, "postMessage");
      requestHighlight("a", "External");
      expect(post).not.toHaveBeenCalled();
      ready();
      expect(post).toHaveBeenCalledWith({ type: "HTNOTE_HIGHLIGHT", query: "External" }, NOTE_ORIGIN);
      fireEvent.load(frame);
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      const updatedUrl = frame.src;
      await act(() => handleExternalChanges({
        changedNoteIds: ["a"], removedNoteIds: [], treeChanged: false, trashChanged: false,
      }));
      expect(frame.src).toBe(updatedUrl);
    } finally {
      post.mockRestore();
      viewer.unmount();
      dispose();
    }
  });

  it("keeps note frames cached and never creates a frame for a special tab", async () => {
    render(<NoteViewer />);
    const frame = await screen.findByTitle("Alpha");
    act(() => useTabsStore.getState().openSpecial("settings"));
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    expect(frame.parentElement).toHaveAttribute("hidden");
    act(() => useTabsStore.getState().openSpecial("trash"));
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    act(() => useTabsStore.getState().openNote("a"));
    expect(screen.getByTitle("Alpha")).toBe(frame);
    expect(frame.parentElement).not.toHaveAttribute("hidden");
  });

  it("uses the exact isolated iframe attributes and loads from the note protocol", async () => {
    render(<NoteViewer />);
    const frame = await screen.findByTitle("Alpha") as HTMLIFrameElement;
    expect(NOTE_IFRAME_SANDBOX).toBe("allow-scripts allow-forms allow-same-origin allow-modals");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-forms allow-same-origin allow-modals");
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(frame).not.toHaveAttribute("srcdoc");
    expect(frame).toHaveAttribute("src", `${noteUrl("a")}?revision=0%3A0`);
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

  it("keeps iframe DOM order, windows and the dark-theme bridge after tab reordering", async () => {
    useSettingsStore.setState({ settings: { theme: "dark" } as Settings });
    const dispose = installBridgeHost();
    const viewer = render(<NoteViewer />);
    const first = await screen.findByTitle("Alpha") as HTMLIFrameElement;
    act(() => useTabsStore.getState().openNote("b"));
    const second = await screen.findByTitle("Beta") as HTMLIFrameElement;
    const parent = first.parentElement!.parentElement!;
    const children = [...parent.children];
    const firstWindow = first.contentWindow!;
    const secondWindow = second.contentWindow!;
    const firstPost = vi.spyOn(firstWindow, "postMessage");
    const secondPost = vi.spyOn(secondWindow, "postMessage");
    const mutations = new MutationObserver(() => {});
    mutations.observe(parent, { childList: true });
    try {
      act(() => useTabsStore.getState().move(0, 1));
      expect(useTabsStore.getState().tabs.map((tab) => tab.noteId)).toEqual(["b", "a"]);
      expect([...parent.children]).toEqual(children);
      expect(mutations.takeRecords()).toEqual([]);
      expect(first.contentWindow).toBe(firstWindow);
      expect(second.contentWindow).toBe(secondWindow);
      for (const source of [firstWindow, secondWindow]) {
        window.dispatchEvent(new MessageEvent("message", { source, origin: NOTE_ORIGIN, data: { type: "HTNOTE_READY" } }));
      }
      for (const post of [firstPost, secondPost]) {
        expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "HTNOTE_THEME", mode: "dark" }), NOTE_ORIGIN);
      }
      requestHighlight("b", "test");
      expect(secondPost).toHaveBeenLastCalledWith({ type: "HTNOTE_HIGHLIGHT", query: "test" }, NOTE_ORIGIN);
      act(() => useTabsStore.getState().activate("a"));
      expect([...parent.children]).toEqual(children);
      expect(first.contentWindow).toBe(firstWindow);
    } finally {
      mutations.disconnect();
      viewer.unmount();
      dispose();
      firstPost.mockRestore();
      secondPost.mockRestore();
    }
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
    useSettingsStore.setState({ settings: { rootDir: null, lastExportDir: null, theme: "system", language: "tr", sidebarWidth: 260, sidebarVisible: true, tabSizing: "fixed", contentWidth: "comfortable", editorSplitRatio: 50, editorLivePreview: true, backlinksExpanded: true, openTabs: [], activeTab: null, expandedFolders: [], onboardingDone: false } });
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

  it("shows input on double click and calls renameNote on Enter", async () => {
    const renameSpy = vi.spyOn(ipc, "renameNote").mockResolvedValue({
      type: "note", id: "a", title: "Alpha Renamed", relPath: "Alpha Renamed", isFavorite: false, tags: [], updatedAt: "2026-01-01T00:00:00Z"
    });
    const refreshSpy = vi.spyOn(useTreeStore.getState(), "refresh").mockImplementation(async () => {
      useTreeStore.setState({
        tree: [
          { type: "note", id: "a", title: "Alpha Renamed", relPath: "Alpha Renamed", isFavorite: false, tags: [], updatedAt: "2026-01-01T00:00:00Z" },
          notes[1],
        ],
      });
    });

    render(<NoteViewer />);
    const heading = screen.getByTestId("note-title");
    expect(heading).toHaveTextContent("Alpha");

    fireEvent.doubleClick(heading);
    const input = screen.getByRole("textbox", { name: "Not başlığını yeniden adlandır" });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Alpha");

    fireEvent.change(input, { target: { value: "Alpha Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(renameSpy).toHaveBeenCalledWith("a", "Alpha Renamed");
    await waitFor(() => {
      expect(screen.getByTestId("note-title")).toHaveTextContent("Alpha Renamed");
    });
    renameSpy.mockRestore();
    refreshSpy.mockRestore();
  });

  it("cancels rename on Escape", () => {
    const renameSpy = vi.spyOn(ipc, "renameNote");
    render(<NoteViewer />);
    fireEvent.doubleClick(screen.getByTestId("note-title"));
    const input = screen.getByRole("textbox", { name: "Not başlığını yeniden adlandır" });
    fireEvent.change(input, { target: { value: "Something Else" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(renameSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Not başlığını yeniden adlandır" })).not.toBeInTheDocument();
    expect(screen.getByTestId("note-title")).toHaveTextContent("Alpha");
    renameSpy.mockRestore();
  });

  it("saves rename on blur", async () => {
    const renameSpy = vi.spyOn(ipc, "renameNote").mockResolvedValue({
      type: "note", id: "a", title: "Alpha Blur", relPath: "Alpha Blur", isFavorite: false, tags: [], updatedAt: "2026-01-01T00:00:00Z"
    });
    render(<NoteViewer />);
    fireEvent.doubleClick(screen.getByTestId("note-title"));
    const input = screen.getByRole("textbox", { name: "Not başlığını yeniden adlandır" });
    fireEvent.change(input, { target: { value: "Alpha Blur" } });
    fireEvent.blur(input);

    expect(renameSpy).toHaveBeenCalledWith("a", "Alpha Blur");
    renameSpy.mockRestore();
  });

  it("shows error toast when rename fails with invalid name", async () => {
    const renameSpy = vi.spyOn(ipc, "renameNote").mockRejectedValue({ code: "INVALID_NAME", message: "Invalid name." });
    render(<NoteViewer />);
    fireEvent.doubleClick(screen.getByTestId("note-title"));
    const input = screen.getByRole("textbox", { name: "Not başlığını yeniden adlandır" });
    fireEvent.change(input, { target: { value: "Bad/Name" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(useUiStore.getState().toasts).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "error", messageKey: "errors.INVALID_NAME" })])
      );
    });
    renameSpy.mockRestore();
  });

  it("starts editing on F2 when heading is focused", () => {
    render(<NoteViewer />);
    const heading = screen.getByTestId("note-title");
    fireEvent.keyDown(heading, { key: "F2" });
    expect(screen.getByRole("textbox", { name: "Not başlığını yeniden adlandır" })).toBeInTheDocument();
  });
});
