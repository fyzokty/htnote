import { usePresence } from "@/components/ui/usePresence";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { DialogActiveContext } from "@/components/ui/useDialogPresence";
import { mediaToolbarOwners, mediaToolbarPosition } from "./mediaToolbarPosition";
import { editorViewport } from "./editorViewport";

export function FloatingMediaToolbar({ anchor, selected, align, children }: {
  anchor: RefObject<HTMLDivElement | null>; selected: boolean; align: string; children: ReactNode;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const [previousSelected, setPreviousSelected] = useState(selected);
  if (previousSelected !== selected) {
    setPreviousSelected(selected);
    if (!selected) setDismissed(false);
  }
  const open = selected && !dismissed;
  const { mounted } = usePresence(open ? true : null);
  useEffect(() => {
    const pointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      const preview = anchor.current?.querySelector(".htnote-media-preview");
      if (preview?.contains(event.target)) setDismissed(false);
      else if (!menu.current?.contains(event.target)) setDismissed(true);
    };
    const reopen = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(".htnote-media-preview")) setDismissed(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setDismissed(true); };
    const wrapper = anchor.current;
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", escape, true);
    wrapper?.addEventListener("click", reopen);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", escape, true);
      wrapper?.removeEventListener("click", reopen);
    };
  }, [anchor]);
  useLayoutEffect(() => {
    if (!mounted || !menu.current || !anchor.current) return;
    const wrapper = anchor.current;
    const layer = menu.current;
    const editor = wrapper.closest<HTMLElement>(".ProseMirror");
    if (editor) mediaToolbarOwners.set(layer, editor);
    const scroll = wrapper.closest(".htnote-visual-scroll");
    const measure = () => {
      const viewport = editorViewport(scroll) ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      layer.style.maxWidth = `${Math.max(0, viewport.right - viewport.left - 16)}px`;
      layer.style.maxHeight = `${Math.max(0, viewport.bottom - viewport.top - 16)}px`;
      const rect = (wrapper.querySelector(".htnote-media-preview") ?? wrapper).getBoundingClientRect();
      const position = mediaToolbarPosition(rect, layer.getBoundingClientRect(), viewport, align);
      layer.dataset.side = position.top < rect.top ? "up" : "down";
      layer.style.left = `${position.left}px`;
      layer.style.top = `${position.top}px`;
      layer.style.visibility = position.visible || rect.width === 0 ? "visible" : "hidden";
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(wrapper);
    observer?.observe(layer);
    if (scroll) observer?.observe(scroll);
    document.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      mediaToolbarOwners.delete(layer);
      document.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [anchor, mounted, align]);
  if (!mounted) return null;
  return createPortal(<DialogActiveContext value={open}>
    <div ref={menu} className="htnote-media-floating htnote-popover-motion htnote-popover-surface" data-closing={!open}
      inert={!open} aria-hidden={!open || undefined} contentEditable={false}
      onMouseDown={(event) => {
        if (!(event.target instanceof Element && event.target.closest("input"))) event.preventDefault();
        event.stopPropagation();
      }} onClick={(event) => event.stopPropagation()}>
      {children}
    </div>
  </DialogActiveContext>, document.body);
}
