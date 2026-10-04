import { useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { nextSidebarPresence, SIDEBAR_CLOSE_MS, SIDEBAR_OPEN_MS } from "./sidebarPresenceState";
import type { SidebarPresenceState } from "./sidebarPresenceState";

export function useSidebarPresence(visible: boolean) {
  const reduced = useReducedMotion();
  const [presence, setPresence] = useState<{ visible: boolean; state: SidebarPresenceState }>({ visible, state: visible ? "open" : "closed" });
  let current = presence;
  if (presence.visible !== visible || (reduced && presence.state !== (visible ? "open" : "closed"))) {
    current = { visible, state: nextSidebarPresence(presence.state, visible ? "show" : "hide", reduced) };
    setPresence(current);
  }
  const state = current.state;
  useEffect(() => {
    if (state === "entering") {
      // İlk dar kare boyanır; ikinci karede genişleme başlar. Ters yönde eski kareler iptal edilir.
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setPresence((previous) => ({ ...previous, state: nextSidebarPresence(previous.state, "start", reduced) })));
      });
      return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
    }
    if (state !== "opening" && state !== "closing") return;
    const timer = setTimeout(() => setPresence((previous) => ({ ...previous, state: nextSidebarPresence(previous.state, "finish", reduced) })), state === "opening" ? SIDEBAR_OPEN_MS : SIDEBAR_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [state, reduced]);
  return { state, mounted: state !== "closed", expanded: state === "open" || state === "opening" };
}
