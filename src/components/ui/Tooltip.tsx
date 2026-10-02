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
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
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
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, label, shortcut]);

  const describedBy = [children.props["aria-describedby"], open ? id : undefined].filter(Boolean).join(" ") || undefined;
  return <>
    <span ref={anchor} className={`htnote-tooltip-anchor ${className}`}
      onMouseEnter={() => { clearTimer(); timer.current = setTimeout(() => { timer.current = null; setOpen(true); }, 400); }}
      onMouseLeave={() => { clearTimer(); if (!anchor.current?.contains(document.activeElement)) setOpen(false); }}
      onFocus={() => { clearTimer(); setOpen(true); }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
      onPointerDown={close}>
      {cloneElement(children, { "aria-describedby": describedBy })}
    </span>
    {open && createPortal(<div ref={tip} id={id} role="tooltip" className="htnote-tooltip select-none" style={position}>
      <span>{label}</span>{shortcut && <kbd aria-label={t("ui.shortcutHint")}>{shortcut}</kbd>}
    </div>, document.body)}
  </>;
}
