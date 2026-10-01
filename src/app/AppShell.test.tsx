import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, expect, it, vi } from "vitest";

import { installUnsavedWindowGuard } from "@/app/unsavedWindowGuard";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";

const windowMock = vi.hoisted(() => ({
  listener: null as null | ((event: { preventDefault: () => void }) => void),
  destroy: vi.fn().mockResolvedValue(undefined),
  unlisten: vi.fn(),
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({
  onCloseRequested: (listener: typeof windowMock.listener) => {
    windowMock.listener = listener;
    return Promise.resolve(windowMock.unlisten);
  },
  destroy: windowMock.destroy,
}) }));

beforeEach(() => {
  resetTabsStoreForTests();
  useUiStore.setState({ unsavedDialog: null, toasts: [] });
  windowMock.destroy.mockClear();
});

it("prevents a dirty native close synchronously and destroys only after resolution", async () => {
  const store = useTabsStore.getState();
  store.openNote("a");
  store.enterEdit("a", { html: "old", css: null, js: null, contentHash: "hash" }, "code");
  store.updateDraft("a", { html: "new" });
  mockIPC((command) => command === "save_note" ? { contentHash: "new-hash" } : undefined);
  const uninstall = installUnsavedWindowGuard();
  const preventDefault = vi.fn();
  windowMock.listener?.({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(windowMock.destroy).not.toHaveBeenCalled();
  windowMock.listener?.({ preventDefault });
  expect(useUiStore.getState().unsavedDialog?.noteIds).toEqual(["a"]);
  useUiStore.getState().unsavedDialog?.resolve("save");
  await vi.waitFor(() => expect(windowMock.destroy).toHaveBeenCalledOnce());
  uninstall();
});

it("lets a clean native close proceed", () => {
  useTabsStore.getState().openNote("a");
  const uninstall = installUnsavedWindowGuard();
  const preventDefault = vi.fn();
  windowMock.listener?.({ preventDefault });
  expect(preventDefault).not.toHaveBeenCalled();
  uninstall();
});

it("keeps the window open after a failed save", async () => {
  const store = useTabsStore.getState();
  store.openNote("a");
  store.enterEdit("a", { html: "old", css: null, js: null, contentHash: "hash" }, "code");
  store.updateDraft("a", { html: "new" });
  mockIPC((command) => { if (command === "save_note") throw { code: "IO_ERROR" }; });
  const uninstall = installUnsavedWindowGuard();
  const preventDefault = vi.fn();
  windowMock.listener?.({ preventDefault });
  useUiStore.getState().unsavedDialog?.resolve("save");
  await vi.waitFor(() => expect(useUiStore.getState().toasts.slice(-1)[0]?.messageKey).toBe("errors.IO_ERROR"));
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(windowMock.destroy).not.toHaveBeenCalled();
  uninstall();
});

it("destroys the window after explicitly discarding dirty changes", async () => {
  const store = useTabsStore.getState();
  store.openNote("a");
  store.enterEdit("a", { html: "old", css: null, js: null, contentHash: "hash" }, "code");
  store.updateDraft("a", { html: "new" });
  mockIPC(() => undefined);
  const uninstall = installUnsavedWindowGuard();
  const preventDefault = vi.fn();
  windowMock.listener?.({ preventDefault });
  useUiStore.getState().unsavedDialog?.resolve("discard");
  await vi.waitFor(() => expect(windowMock.destroy).toHaveBeenCalledOnce());
  expect(preventDefault).toHaveBeenCalledOnce();
  uninstall();
});
