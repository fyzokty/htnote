import { DialogActiveContext } from "@/components/ui/useDialogPresence";
import { usePresence } from "@/components/ui/usePresence";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/ui/IconButton";
import { fitToolbarGroups } from "./toolbarLayout";

export function ToolbarGroups({ groups }: { groups: ReactNode[] }) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef(false);
  const id = useId();
  const [visible, setVisible] = useState(groups.map((_, index) => index));
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const available = element.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      if (!available) return;
      const widths = [...element.querySelectorAll<HTMLElement>("[data-toolbar-group]")]
        .sort((a, b) => Number(a.dataset.toolbarGroup) - Number(b.dataset.toolbarGroup))
        .map((group) => group.getBoundingClientRect().width);
      const next = fitToolbarGroups(available, widths, trigger.current?.getBoundingClientRect().width ?? 28, parseFloat(style.columnGap) || 6);
      setVisible((old) => old.length === next.length && old.every((index, position) => index === next[position]) ? old : next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    element.querySelectorAll<HTMLElement>("[data-toolbar-group]").forEach((group) => observer?.observe(group));
    let current = true;
    void document.fonts?.ready.then(() => { if (current) measure(); });
    return () => { current = false; observer?.disconnect(); };
  }, [groups, visible]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    if (focusOnOpen.current) panel.current?.querySelector<HTMLElement>("button:not(:disabled), select, input")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !(event.target as HTMLElement).closest?.(".htnote-color-popover, .htnote-font-popover, .htnote-select-popover, .htnote-tooltip")) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const hasOverflow = visible.length < groups.length;
  const presence = usePresence(open && hasOverflow ? true : null);
  const overflowGroups = <DialogActiveContext value={open && hasOverflow}>{groups.map((group, index) => !visible.includes(index) && <div className="htnote-toolbar-group-slot" data-toolbar-group={index} key={index}>{group}</div>)}</DialogActiveContext>;
  return <div ref={root} className="htnote-toolbar-groups">
    {visible.map((index) => <div className="htnote-toolbar-group-slot" data-toolbar-group={index} key={index}>{groups[index]}</div>)}
    {hasOverflow && <IconButton ref={trigger} size="sm" data-testid="editor-overflow" label={t("editor.overflow")}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => { focusOnOpen.current = event.detail === 0; setOpen(!open); }}><MoreHorizontal size={16} aria-hidden="true" /></IconButton>}
    {presence.mounted ? <div key="menu" id={id} ref={panel} role="dialog" aria-label={t("editor.overflow")} aria-hidden={!open || !hasOverflow}
      inert={!open || !hasOverflow} className={`htnote-toolbar-overflow ${presence.mounted ? "htnote-popover-motion" : ""}`} data-closing={presence.closing} data-open={presence.mounted}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key === "Tab" || (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key) && !["SELECT", "INPUT"].includes((event.target as HTMLElement).tagName))) {
          event.preventDefault();
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select, input")];
          const backward = event.shiftKey || event.key === "ArrowLeft" || event.key === "ArrowUp";
          controls[(controls.indexOf(document.activeElement as HTMLElement) + (backward ? controls.length - 1 : 1)) % controls.length]?.focus();
        }
      }}>
      {overflowGroups}
    </div> : <div key="measure" className="htnote-toolbar-measure" inert aria-hidden>{overflowGroups}</div>}
  </div>;
}
