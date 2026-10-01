import { mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { AppShell } from "@/app/AppShell";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

vi.mock("@/features/tree/SidebarTree", () => ({ SidebarTree: () => null }));
vi.mock("@/features/tabs/TabBar", () => ({ TabBar: () => null }));
vi.mock("@/features/viewer/NoteViewer", () => ({ NoteViewer: () => null }));
vi.mock("@/features/viewer/bridgeHost", () => ({ installBridgeHost: () => () => {} }));
vi.mock("@/features/tree/fsChangeSync", () => ({ startFsChangeSync: () => () => {} }));
vi.mock("@/features/tree/useTreeActions", () => ({ useTreeActions: () => ({ createNote: vi.fn(), createFolder: vi.fn() }) }));
vi.mock("@/lib/shortcuts/manager", () => ({ installShortcutListener: () => () => {} }));
vi.mock("@/lib/shortcuts/useShortcut", () => ({ useShortcut: () => {} }));

beforeEach(() => {
  resetTabsStoreForTests();
  useUiStore.setState({ unsavedDialog: null, toasts: [] });
  useTreeStore.setState({ tree: [], load: async () => {
    useTreeStore.setState({ tree: [{ type: "note", id: "a", title: "Başlık", relPath: "Başlık", isFavorite: false, tags: [], updatedAt: "2026-09-30T00:00:00Z" }] });
  } });
});

it("restores draft content as a dirty edit against the current disk base", async () => {
  const commands: string[] = [];
  mockIPC((command) => {
    commands.push(command);
    if (command === "list_drafts" || command === "read_draft") {
      return command === "list_drafts"
        ? [{ id: "a", html: "draft html", css: "draft css", js: "draft js", baseHash: "old-hash", savedAt: "2026-10-01T00:00:00Z" }]
        : { id: "a", html: "draft html", css: "draft css", js: "draft js", baseHash: "old-hash", savedAt: "2026-10-01T00:00:00Z" };
    }
    if (command === "read_note") return { html: "disk html", css: "disk css", js: "disk js", contentHash: "current-hash" };
  });

  render(<AppShell />);
  expect(await screen.findByText(/diskte değişti/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Kurtar" }));
  await waitFor(() => expect(useTabsStore.getState().isDirty("a")).toBe(true));
  const doc = useTabsStore.getState().tabs.find((tab) => tab.noteId === "a")?.doc;
  expect(doc?.mode).not.toBe("view");
  expect(doc?.base).toMatchObject({ html: "disk html", contentHash: "current-hash" });
  expect(doc?.draft).toMatchObject({ html: "draft html", css: "draft css", js: "draft js" });
  expect(commands).toContain("read_draft");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
