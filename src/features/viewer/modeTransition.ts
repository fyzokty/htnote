import type { Mode } from "@/features/editor/docState";
export function modeTransition(from: Mode, to: Mode): "none" | "fade" | "slide" {
  return from === to ? "none" : to === "view" ? "fade" : "slide";
}
