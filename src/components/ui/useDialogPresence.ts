import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { dialogCloseDuration, nextDialogPresence } from "./dialogPresenceState";
import type { DialogPresenceState } from "./dialogPresenceState";

const motionQuery = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (notify: () => void) => {
  const media = window.matchMedia?.(motionQuery);
  media?.addEventListener("change", notify);
  return () => media?.removeEventListener("change", notify);
};
const readMotion = () => window.matchMedia?.(motionQuery).matches ?? false;
export const DialogActiveContext = createContext(true);
export const useDialogActive = () => useContext(DialogActiveContext);
export const useReducedMotion = () => useSyncExternalStore(subscribeMotion, readMotion, () => false);

export function useDialogPresence<T>(content: T | null, closeMs?: number) {
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState<DialogPresenceState<T>>({ content, open: content !== null });
  const open = content !== null;
  let current = state;
  if (open !== state.open || (open && content !== state.content) || (!open && reducedMotion && state.content !== null)) {
    current = nextDialogPresence(state, content, reducedMotion);
    setState(current);
  }
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setState({ content: null, open: false }), reducedMotion ? 0 : closeMs ?? dialogCloseDuration(false));
    return () => clearTimeout(timer);
  }, [open, reducedMotion, closeMs]);
  return { content: current.content, mounted: current.content !== null, closing: !open };
}

export function useDialogBackdrop() {
  const active = useDialogActive();
  return { inert: !active, "aria-hidden": !active || undefined, "data-closing": !active } as const;
}
