import { useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { nextPresence, presenceCloseDuration, type PresenceState } from "./presenceState";

export function usePresence<T>(content: T | null) {
  const reduced = useReducedMotion();
  const [state, setState] = useState<PresenceState<T>>({ content, open: content !== null });
  const open = content !== null;
  let current = state;
  if (open !== state.open || (open && content !== state.content) || (!open && reduced && state.content !== null)) {
    current = nextPresence(state, content, reduced);
    setState(current);
  }
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setState({ content: null, open: false }), presenceCloseDuration(reduced));
    return () => clearTimeout(timer);
  }, [open, reduced]);
  return { content: current.content, mounted: current.content !== null, closing: !open };
}
