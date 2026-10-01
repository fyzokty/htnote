import { mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fsChangeBus, onFsChange } from "@/lib/events";
import type { FsChangePayload, TreeNode } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";

import { startFsChangeSync } from "./fsChangeSync";

const eventMock = vi.hoisted(() => ({
  listen: vi.fn<(name: string, handler: (event: { payload: FsChangePayload }) => void) => Promise<() => void>>(),
  stop: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: eventMock.listen }));

const payload: FsChangePayload = { changedNoteIds: [], removedNoteIds: [], treeChanged: true, trashChanged: false };
const original: TreeNode[] = [{ type: "folder", name: "A", relPath: "A", children: [
  { type: "note", id: "n", title: "Note", relPath: "A/Note", isFavorite: false, tags: [], updatedAt: "" },
] }];

function emit(change: FsChangePayload) {
  const calls = eventMock.listen.mock.calls;
  const handler = calls[calls.length - 1]?.[1];
  if (!handler) throw new Error("fs-change listener missing");
  handler({ payload: change });
}

beforeEach(() => {
  resetTreeStoreForTests();
  useSettingsStore.setState({ settings: null, status: "idle" });
  eventMock.listen.mockReset();
  eventMock.stop.mockReset();
  eventMock.listen.mockResolvedValue(eventMock.stop);
});

afterEach(() => { vi.useRealTimers(); });

describe("fs-change integration", () => {
  it("listens to fs-change and publishes to subscribers until unsubscribed", async () => {
    const subscriber = vi.fn();
    const handler = vi.fn();
    const unsubscribe = fsChangeBus.subscribe(subscriber);
    const unlisten = await onFsChange(handler);
    expect(eventMock.listen).toHaveBeenCalledWith("fs-change", expect.any(Function));
    emit(payload);
    expect(subscriber).toHaveBeenCalledWith(payload);
    expect(handler).toHaveBeenCalledWith(payload);
    unsubscribe();
    emit(payload);
    expect(subscriber).toHaveBeenCalledTimes(1);
    unlisten();
    expect(eventMock.stop).toHaveBeenCalledOnce();
  });

  it("debounces tree changes, keeps a moved note selected and prunes deleted selection", async () => {
    let nodes = original;
    let requests = 0;
    mockIPC((command) => {
      if (command === "get_note_tree") { requests++; return nodes; }
      return undefined;
    });
    await useTreeStore.getState().load();
    useTreeStore.getState().toggle("A");
    useTreeStore.getState().select({ kind: "note", id: "n" });
    const subscriber = vi.fn();
    const unsubscribe = fsChangeBus.subscribe(subscriber);
    vi.useFakeTimers();
    const stop = startFsChangeSync();
    await Promise.resolve();

    emit({ ...payload, treeChanged: false });
    await vi.advanceTimersByTimeAsync(150);
    expect(requests).toBe(1);
    expect(subscriber).toHaveBeenCalledTimes(1);

    nodes = [{ type: "folder", name: "A", relPath: "A", children: [
      { type: "note", id: "n", title: "Note", relPath: "A/Moved", isFavorite: false, tags: [], updatedAt: "" },
    ] }];
    emit(payload);
    await vi.advanceTimersByTimeAsync(100);
    emit(payload);
    await vi.advanceTimersByTimeAsync(149);
    expect(requests).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests).toBe(2);
    expect(useTreeStore.getState().selected).toEqual({ kind: "note", id: "n" });
    expect([...useTreeStore.getState().expanded]).toEqual(["A"]);
    expect(useTreeStore.getState().findNoteById("n")?.relPath).toBe("A/Moved");

    nodes = [{ type: "folder", name: "A", relPath: "A", children: [] }];
    emit(payload);
    await vi.advanceTimersByTimeAsync(150);
    expect(useTreeStore.getState().selected).toBeNull();
    expect([...useTreeStore.getState().expanded]).toEqual(["A"]);
    stop();
    unsubscribe();
    expect(eventMock.stop).toHaveBeenCalledOnce();
  });

  it("cancels a pending refresh and unlistens after asynchronous registration", async () => {
    let register!: (stop: () => void) => void;
    eventMock.listen.mockReturnValue(new Promise((resolve) => { register = resolve; }));
    vi.useFakeTimers();
    const stop = startFsChangeSync();
    emit(payload);
    stop();
    register(eventMock.stop);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(150);
    expect(eventMock.stop).toHaveBeenCalledOnce();
  });
});
