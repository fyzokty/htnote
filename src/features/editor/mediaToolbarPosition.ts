type Bounds = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

export const mediaToolbarOwners = new WeakMap<Element, HTMLElement>();

export function mediaToolbarPosition(anchor: Bounds, menu: { width: number; height: number }, viewport: Bounds, align: string) {
  const gap = 8;
  const left = align === "right" ? anchor.right - menu.width : align === "center"
    ? (anchor.left + anchor.right - menu.width) / 2 : anchor.left;
  const above = anchor.top - menu.height - gap;
  return {
    left: Math.max(viewport.left + gap, Math.min(left, viewport.right - menu.width - gap)),
    top: Math.max(viewport.top + gap, Math.min(above >= viewport.top + gap ? above : anchor.bottom + gap,
      viewport.bottom - menu.height - gap)),
    visible: anchor.bottom > viewport.top && anchor.top < viewport.bottom && anchor.right > viewport.left && anchor.left < viewport.right,
  };
}
