import { PopoverPresence } from "@/components/ui/PopoverPresence";
import { useDialogActive } from "@/components/ui/useDialogPresence";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Palette } from "lucide-react";
import { CustomColorPanel } from "./CustomColorPanel";

import { Button } from "./Button";
import { IconButton } from "./IconButton";

export interface ColorOption { value: string; label: string; color: string }

interface Props {
  label: string;
  value: string;
  options: ColorOption[];
  onChange: (value: string) => void;
  custom?: boolean;
  getComputedColor?: () => string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export function ColorPicker({ label, value, options, onChange, custom = false, getComputedColor, disabled, icon }: Props) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return <>
    <IconButton size="sm" label={label} disabled={disabled} aria-expanded={!!anchor} aria-haspopup="dialog"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}>
      {icon ?? <Palette className="size-4" aria-hidden />}
    </IconButton>
    <PopoverPresence>{anchor && <ColorPopover label={label} value={value} options={options} custom={custom} getComputedColor={getComputedColor} anchor={anchor}
      onClose={() => setAnchor(null)} onChange={(next) => { onChange(next); setAnchor(null); }} defaultLabel={t("colors.default")} />}</PopoverPresence>
  </>;
}

function ColorPopover({ label, value, options, onChange, custom, getComputedColor, anchor, onClose, defaultLabel }: Omit<Props, "icon" | "disabled"> & {
  anchor: HTMLElement; onClose: () => void; defaultLabel: string;
}) {
  const { t } = useTranslation();
  const active = useDialogActive();
  const panel = useRef<HTMLDivElement>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [previousActive, setPreviousActive] = useState(active);
  if (previousActive !== active) {
    setPreviousActive(active);
    if (active) setCustomOpen(false);
  }
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; });
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!active) return;
    const rect = anchor.getBoundingClientRect();
    const bounds = panel.current!.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, rect.bottom + bounds.height > window.innerHeight ? rect.top - bounds.height : rect.bottom + 4) });
    const controls = [...panel.current!.querySelectorAll<HTMLElement>('button, input, [role="slider"]')].filter((control) => !control.closest("[inert]"));
    (customOpen ? controls.find((control) => control.getAttribute("role") === "slider")
      : controls.find((control) => control.getAttribute("aria-pressed") === "true") ?? controls.find((control) => control.tagName === "BUTTON"))?.focus();
  }, [anchor, customOpen, active]);
  useEffect(() => {
    if (!active) return;
    const element = panel.current;
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) close.current(); };
    const reposition = () => close.current();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
      if (document.activeElement === document.body || element?.contains(document.activeElement)) anchor.focus();
    };
  }, [anchor, active]);
  return createPortal(<div ref={panel} role="dialog" aria-label={label} data-custom={customOpen} inert={!active} aria-hidden={!active || undefined} data-closing={!active} data-side={position.top < anchor.getBoundingClientRect().top ? "up" : "down"} className="htnote-popover-motion htnote-dialog-surface htnote-color-popover" style={position}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (customOpen) { setCustomOpen(false); } else onClose(); }
      if (event.key === "Tab" || (!customOpen && ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key))) {
        event.preventDefault(); event.stopPropagation();
        const controls = [...panel.current!.querySelectorAll<HTMLElement>("button:not(:disabled), input, [tabindex=\"0\"]")].filter((control) => !control.closest("[inert]"));
        const backward = event.shiftKey || event.key === "ArrowLeft" || event.key === "ArrowUp";
        controls[(controls.indexOf(document.activeElement as HTMLElement) + (backward ? controls.length - 1 : 1)) % controls.length]?.focus();
      }
    }}>
    <p className="mb-2 text-sm font-medium">{label}</p>
    <PopoverPresence>{customOpen && <CustomColorPanel value={value} getComputedColor={getComputedColor} onApply={onChange} onCancel={() => { setCustomOpen(false); }} />}</PopoverPresence>{!customOpen && <>
    <Button variant="ghost" size="sm" className="w-full" aria-pressed={!value} onClick={() => onChange("")}>{defaultLabel}</Button>
    <div className="htnote-color-grid">{options.map((option) => <Button variant="ghost" size="sm" key={option.value}
      aria-label={option.label} title={option.label} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      <span className="htnote-color-swatch" style={{ background: option.color }} aria-hidden />
      <span className="sr-only">{option.label}</span>
    </Button>)}</div>
    {custom && <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setCustomOpen(true)}>{t("colors.custom")}</Button>}
    </>}
  </div>, document.body);
}
