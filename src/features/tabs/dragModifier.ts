import type { Modifier } from "@dnd-kit/core";

// Keep the dragged tab inside the visible strip, including when it scrolls.
export const restrictToTabStrip: Modifier = ({ transform, draggingNodeRect, scrollableAncestorRects }) => {
  const strip = scrollableAncestorRects[0];
  if (!draggingNodeRect || !strip) return { ...transform, y: 0 };
  const min = strip.left - draggingNodeRect.left;
  const max = strip.right - draggingNodeRect.right;
  return { ...transform, x: Math.max(min, Math.min(Math.max(min, max), transform.x)), y: 0 };
};
