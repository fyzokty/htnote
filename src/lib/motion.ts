import type { Motion } from "./types";

export function resolveReducedMotion(motion: Motion, systemReduced: boolean): boolean {
  return motion === "off" || (motion === "system" && systemReduced);
}

function systemMedia() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)");
}

export const readSystemReducedMotion = () => systemMedia()?.matches ?? false;
export function subscribeSystemMotion(notify: () => void): () => void {
  const media = systemMedia();
  media?.addEventListener("change", notify);
  return () => media?.removeEventListener("change", notify);
}

export function applyReducedMotion(reduced: boolean): void {
  document.documentElement.dataset.reducedMotion = String(reduced);
}

export const MODE_TRANSITION_MS = 200;
export const MOTION_ENTER_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
