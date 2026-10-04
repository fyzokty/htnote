import { POPOVER_CLOSE_MS } from "@/lib/motion";

export interface PresenceState<T> { content: T | null; open: boolean }

export function nextPresence<T>(previous: PresenceState<T>, content: T | null, reduced: boolean): PresenceState<T> {
  return { open: content !== null, content: content ?? (reduced ? null : previous.content) };
}

export function presenceCloseDuration(reduced: boolean): number {
  return reduced ? 0 : POPOVER_CLOSE_MS;
}
