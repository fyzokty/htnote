import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { NoteViewer } from "@/features/viewer/NoteViewer";
import { NOTE_IFRAME_SANDBOX, noteUrl } from "@/lib/noteUrl";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";

const notes = [
  { type: "note" as const, id: "a", title: "Alpha", relPath: "Alpha", isFavorite: false, tags: [], updatedAt: "2026-01-01T00:00:00Z" },
  { type: "note" as const, id: "b", title: "Beta", relPath: "Beta", isFavorite: false, tags: [], updatedAt: "2026-01-01T00:00:00Z" },
];

beforeEach(() => {
  resetTabsStoreForTests();
  resetTreeStoreForTests();
  useTreeStore.setState({ tree: notes });
  useTabsStore.getState().openNote("a");
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
});
