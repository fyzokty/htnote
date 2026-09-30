import { useEffect, useRef } from "react";

import { subscribeShortcut } from "@/lib/shortcuts/manager";
import type { ShortcutId } from "@/lib/shortcuts/registry";

export function useShortcut(id: ShortcutId, handler: () => void, { enabled = true }: { enabled?: boolean } = {}): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeShortcut(id, () => handlerRef.current());
  }, [id, enabled]);
}
