export const DIALOG_CLOSE_MS = 140;

export interface DialogPresenceState<T> {
  content: T | null;
  open: boolean;
}

export function nextDialogPresence<T>(previous: DialogPresenceState<T>, content: T | null, reducedMotion: boolean): DialogPresenceState<T> {
  return { open: content !== null, content: content ?? (reducedMotion ? null : previous.content) };
}

export function dialogCloseDuration(reducedMotion: boolean): number {
  return reducedMotion ? 0 : DIALOG_CLOSE_MS;
}
