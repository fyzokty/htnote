import { useLayoutEffect, useSyncExternalStore } from "react";
import { applyReducedMotion, readSystemReducedMotion, resolveReducedMotion, subscribeSystemMotion } from "@/lib/motion";
import { useSettingsStore } from "@/stores/settingsStore";

export function useReducedMotion(): boolean {
  const motion = useSettingsStore((state) => state.settings?.motion ?? "system");
  const systemReduced = useSyncExternalStore(subscribeSystemMotion, readSystemReducedMotion, () => false);
  return resolveReducedMotion(motion, systemReduced);
}

export function useMotionMode(): void {
  const reduced = useReducedMotion();
  useLayoutEffect(() => applyReducedMotion(reduced), [reduced]);
}
