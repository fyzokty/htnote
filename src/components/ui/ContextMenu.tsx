import { useDialogActive } from "./useDialogPresence";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
export interface ContextMenuItem {
  id: string;
  testId?: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
  separatorBefore?: boolean;
  onSelect: () => void;
}

interface Props {
  items: ContextMenuItem[];
  x: number;
  y: number;
  trigger: HTMLElement | null;
  onClose: () => void;
}

export function ContextMenu({ items, x, y, trigger, onClose }: Props) {
  const active = useDialogActive();
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const enabled = items.map((item, index) => !item.disabled ? index : -1).filter((index) => index >= 0);
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element || !active) return;
    const rect = element.getBoundingClientRect();
    setPosition({ left: Math.max(0, Math.min(x, window.innerWidth - rect.width)), top: Math.max(0, Math.min(y, window.innerHeight - rect.height)) });
    element.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled=true])")?.focus();
  }, [x, y, active]);
  useEffect(() => {
    if (!active) return;
    function outside(event: PointerEvent) { if (!menu.current?.contains(event.target as Node)) onClose(); }
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("pointerdown", outside); trigger?.focus(); };
  }, [onClose, trigger, active]);
  function activate(item: ContextMenuItem) { if (active && !item.disabled) { item.onSelect(); onClose(); } }
  return <div ref={menu} role="menu" inert={!active} aria-hidden={!active || undefined} data-closing={!active} data-side={position.top < y ? "up" : "down"} className="htnote-popover-motion htnote-popover-surface select-none fixed z-50 min-w-48 p-1 text-sm text-app-text shadow-lg" style={position} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (enabled.length === 0) return;
      const current = Number((event.target as HTMLElement).dataset.index);
      const at = enabled.indexOf(current);
      const next = enabled[(at + (event.key === "ArrowDown" ? 1 : enabled.length - 1)) % enabled.length];
      menu.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
    }
  }}>
    {items.map((item, index) => <div key={item.id} title={item.title}>{item.separatorBefore && <div role="separator" className="my-1 border-t border-app-border" />}<Button variant="ghost" size="sm" type="button" role="menuitem" data-testid={item.testId} data-index={index} tabIndex={-1} title={item.title} aria-disabled={item.disabled || undefined} disabled={item.disabled} onClick={() => activate(item)} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(item); }
    }} className={`flex w-full items-center justify-between gap-5 rounded px-3 py-1.5 text-left hover:bg-app-subtle focus:bg-app-subtle focus-visible:outline-2 focus-visible:outline-app-focus disabled:opacity-50 ${item.danger ? "text-app-danger" : ""}`}>
      {item.icon ? <span className="flex items-center gap-2"><span className="shrink-0" aria-hidden>{item.icon}</span>{item.label}</span> : item.label}{item.shortcut && <kbd className="htnote-kbd">{item.shortcut}</kbd>}
    </Button></div>)}
  </div>;
}
