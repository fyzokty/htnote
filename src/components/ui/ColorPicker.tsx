import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Palette } from "lucide-react";
import { colorInputValue } from "@/lib/colors";

import { Button } from "./Button";
import { IconButton } from "./IconButton";

export interface ColorOption { value: string; label: string; color: string }

interface Props {
  label: string;
  value: string;
  options: ColorOption[];
  onChange: (value: string) => void;
  custom?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export function ColorPicker({ label, value, options, onChange, custom = false, disabled, icon }: Props) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return <>
    <IconButton size="sm" label={label} disabled={disabled} aria-expanded={!!anchor} aria-haspopup="dialog"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}>
      {icon ?? <Palette className="size-4" aria-hidden />}
    </IconButton>
    {anchor && <ColorPopover label={label} value={value} options={options} custom={custom} anchor={anchor}
      onClose={() => setAnchor(null)} onChange={(next) => { onChange(next); setAnchor(null); }} defaultLabel={t("colors.default")} />}
  </>;
}

function ColorPopover({ label, value, options, onChange, custom, anchor, onClose, defaultLabel }: Omit<Props, "icon" | "disabled"> & {
  anchor: HTMLElement; onClose: () => void; defaultLabel: string;
}) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; });
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const bounds = panel.current!.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, rect.bottom + bounds.height > window.innerHeight ? rect.top - bounds.height : rect.bottom + 4) });
    (panel.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? panel.current?.querySelector<HTMLElement>("button"))?.focus();
  }, [anchor]);
  useEffect(() => {
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
  }, [anchor]);
  return createPortal(<div ref={panel} role="dialog" aria-label={label} className="htnote-dialog-surface htnote-color-popover" style={position}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Tab"].includes(event.key)) {
        event.preventDefault();
        const controls = [...panel.current!.querySelectorAll<HTMLElement>("button, input")];
        const backward = event.shiftKey || event.key === "ArrowLeft" || event.key === "ArrowUp";
        controls[(controls.indexOf(document.activeElement as HTMLElement) + (backward ? controls.length - 1 : 1)) % controls.length]?.focus();
      }
    }}>
    <p className="mb-2 text-sm font-medium">{label}</p>
    <Button variant="ghost" size="sm" className="w-full" aria-pressed={!value} onClick={() => onChange("")}>{defaultLabel}</Button>
    <div className="htnote-color-grid">{options.map((option) => <Button variant="ghost" size="sm" key={option.value}
      aria-label={option.label} title={option.label} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      <span className="htnote-color-swatch" style={{ background: option.color }} aria-hidden />
      <span className="sr-only">{option.label}</span>
    </Button>)}</div>
    {custom && <label className="mt-2 flex items-center justify-between gap-2 text-xs">{t("colors.custom")}
      <input type="color" aria-label={t("colors.custom")} value={colorInputValue(value)}
        onChange={(event) => onChange(event.target.value)} />
    </label>}
  </div>, document.body);
}
