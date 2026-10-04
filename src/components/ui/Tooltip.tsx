import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface Props {
  label: string;
  shortcut?: string;
  children: ReactElement<{ "aria-describedby"?: string }>;
  className?: string;
}

function isVisible(anchor: HTMLElement | null): anchor is HTMLElement {
  if (!anchor?.isConnected || anchor.closest('[inert], [aria-hidden="true"], [hidden]')) return false;
  const rect = anchor.getBoundingClientRect();
  const style = getComputedStyle(anchor);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.visibility !== "collapse";
}

function hasKeyboardFocus(anchor: HTMLElement | null) {
  const focused = document.activeElement;
  return focused instanceof HTMLElement && anchor?.contains(focused) && focused.matches(":focus-visible");
}

export function Tooltip({ label, shortcut, children, className = "" }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const clearTimer = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  const close = () => { clearTimer(); setOpen(false); };

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
        setOpen(false);
      }
    };
    document.addEventListener("keydown", escape, true);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      document.removeEventListener("keydown", escape, true);
    };
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const dismiss = () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      setOpen(false);
    };
    const place = () => {
      if (!isVisible(anchor.current)) { dismiss(); return; }
      const rect = anchor.current.getBoundingClientRect();
      const box = tip.current?.getBoundingClientRect();
      if (!rect || !box) return;
      const margin = 8;
      const below = rect.bottom + margin;
      const top = below + box.height <= window.innerHeight - margin ? below : rect.top - box.height - margin;
      setPosition({
        left: Math.max(margin, Math.min(rect.left + (rect.width - box.width) / 2, window.innerWidth - box.width - margin)),
        top: Math.max(margin, Math.min(top, window.innerHeight - box.height - margin)),
      });
    };
    place();
    // Bir ata gizlendiğinde (özellikle inert taşma paneli) blur gelmeyebilir.
    // Tooltip ayrı bir body portalında olduğu için DOM'dan kopma da izlenir.
    const mutations = new MutationObserver(() => {
      if (!isVisible(anchor.current)) dismiss();
    });
    mutations.observe(document, { childList: true, subtree: true });
    for (let element: HTMLElement | null = anchor.current; element; element = element.parentElement) {
      mutations.observe(element, { attributes: true, attributeFilter: ["inert", "aria-hidden", "hidden", "class", "style"] });
    }
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (anchor.current) resize?.observe(anchor.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      mutations.disconnect();
      resize?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, label, shortcut]);

  const describedBy = [children.props["aria-describedby"], open ? id : undefined].filter(Boolean).join(" ") || undefined;
  return <>
    <span ref={anchor} className={`htnote-tooltip-anchor ${className}`}
      onMouseEnter={() => { clearTimer(); timer.current = setTimeout(() => { timer.current = null; if (isVisible(anchor.current)) setOpen(true); }, 400); }}
      onMouseLeave={() => { clearTimer(); if (!hasKeyboardFocus(anchor.current)) setOpen(false); }}
      onFocus={() => { clearTimer(); if (hasKeyboardFocus(anchor.current) && isVisible(anchor.current)) setOpen(true); }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
      onPointerDown={close}>
      {cloneElement(children, { "aria-describedby": describedBy })}
    </span>
    {open && createPortal(<div ref={tip} id={id} role="tooltip" className="htnote-popover-surface htnote-tooltip select-none" style={position}>
      <span>{label}</span>{shortcut && <kbd aria-label={t("ui.shortcutHint")}>{shortcut}</kbd>}
    </div>, document.body)}
  </>;
}
