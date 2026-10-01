import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import type { FsChangePayload } from "@/lib/types";

type FsChangeHandler = (payload: FsChangePayload) => void;

const subscribers = new Set<FsChangeHandler>();

export const fsChangeBus = {
  subscribe(handler: FsChangeHandler) {
    subscribers.add(handler);
    return () => { subscribers.delete(handler); };
  },
  publish(payload: FsChangePayload) {
    for (const handler of subscribers) handler(payload);
  },
};

export function onFsChange(handler: FsChangeHandler): Promise<UnlistenFn> {
  return listen<FsChangePayload>("fs-change", (event) => {
    fsChangeBus.publish(event.payload);
    handler(event.payload);
  });
}

export type FileDropEvent = {
  type: "enter" | "over" | "drop" | "leave";
  position?: { x: number; y: number };
  paths: string[];
};

export function onFileDrop(handler: (event: FileDropEvent) => void): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent(({ payload }) => {
    handler({ type: payload.type, position: "position" in payload ? payload.position : undefined,
      paths: "paths" in payload ? payload.paths : [] });
  });
}
