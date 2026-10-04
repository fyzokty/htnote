import { DIALOG_CLOSE_MS } from "@/components/ui/dialogPresenceState";

export const SIDEBAR_OPEN_MS = 180;
export const SIDEBAR_CLOSE_MS = DIALOG_CLOSE_MS;
export type SidebarPresenceState = "entering" | "opening" | "open" | "closing" | "closed";
export type SidebarPresenceEvent = "show" | "hide" | "start" | "finish";

export function nextSidebarPresence(state: SidebarPresenceState, event: SidebarPresenceEvent, reducedMotion: boolean): SidebarPresenceState {
  if (event === "show") return reducedMotion ? "open" : state === "closed" ? "entering" : state === "closing" ? "opening" : state;
  if (event === "hide") return reducedMotion || state === "entering" ? "closed" : state === "closed" ? "closed" : "closing";
  if (event === "start") return state === "entering" ? "opening" : state;
  return state === "opening" ? "open" : state === "closing" ? "closed" : state;
}
