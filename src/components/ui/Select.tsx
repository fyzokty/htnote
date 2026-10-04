import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { usePresence } from "./usePresence";
import { useDialogActive } from "./useDialogPresence";
import { matchSelectOption, moveSelectOption, type SelectOption } from "./selectState";

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  onOpen?: () => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "data-testid"?: string;
}

export function Select({ value, options, onChange, onOpen, disabled, className, ...aria }: Props) {
  const parentActive = useDialogActive();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const typed = useRef({ value: "", time: 0 });
  const id = useId();
  const selected = options.findIndex((option) => option.value === value);
  const isOpen = open && parentActive && !disabled;
  const presence = usePresence(isOpen ? true : null);
  const [position, setPosition] = useState({ left: 0, top: 0, minWidth: 0, side: "down" });
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const show = (key?: string) => {
    onOpen?.();
    typed.current = { value: "", time: 0 };
    setActive(key === "Home" || key === "End" ? moveSelectOption(options, selected, key) : selected >= 0 && !options[selected].disabled ? selected : moveSelectOption(options, -1, "Home"));
    setOpen(true);
  };
  useLayoutEffect(() => {
    if (!isOpen || !trigger.current || !panel.current) return;
    const rect = trigger.current.getBoundingClientRect(), bounds = panel.current.getBoundingClientRect();
    const up = rect.bottom + bounds.height + 4 > window.innerHeight;
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(bounds.width, rect.width) - 8)),
      top: Math.max(8, up ? rect.top - bounds.height - 4 : rect.bottom + 4), minWidth: rect.width, side: up ? "up" : "down" });
    panel.current.focus();
  }, [isOpen]);
  useLayoutEffect(() => {
    if (isOpen) panel.current?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const layer = panel.current;
    const button = trigger.current;
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    const resize = () => { setOpen(false); trigger.current?.focus(); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", resize);
      if (layer?.contains(document.activeElement) || document.activeElement === document.body) button?.focus();
    };
  }, [isOpen]);
  const choose = (index: number) => {
    if (!isOpen || !options[index] || options[index].disabled) return;
    close();
    onChange(options[index].value);
  };
  const keyDown = (event: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      typed.current = { value: "", time: 0 };
      if (!isOpen) show(event.key); else setActive(moveSelectOption(options, active, event.key));
    } else if (event.key === "Enter" || (event.key === " " && (!isOpen || !typed.current.value || Date.now() - typed.current.time >= 700))) {
      event.preventDefault(); event.stopPropagation();
      if (isOpen) choose(active); else show();
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault(); event.stopPropagation(); close();
    } else if (event.key === "Tab" && isOpen) {
      close();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); event.stopPropagation();
      if (!isOpen) show();
      const now = Date.now();
      const query = (now - typed.current.time < 700 ? typed.current.value : "") + event.key;
      typed.current = { value: query, time: now };
      setActive(matchSelectOption(options, query, isOpen ? active : selected));
    }
  };
  return <>
    <button {...aria} ref={trigger} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={isOpen}
      aria-controls={presence.mounted ? id : undefined} aria-activedescendant={isOpen && active >= 0 ? `${id}-${active}` : undefined}
      disabled={disabled} className={`htnote-select-trigger ${className ?? ""}`} onKeyDown={keyDown}
      onMouseDown={(event) => event.preventDefault()} onClick={() => isOpen ? close() : show()}>
      <span>{options[selected]?.label}</span><ChevronDown size={12} aria-hidden />
    </button>
    {presence.mounted && createPortal(<div ref={panel} id={id} role="listbox" tabIndex={-1}
      aria-label={aria["aria-label"]} aria-labelledby={aria["aria-labelledby"]} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
      inert={!isOpen} aria-hidden={!isOpen || undefined} data-closing={!isOpen} data-side={position.side}
      className="htnote-select-popover htnote-popover-surface htnote-popover-motion" style={{ left: position.left, top: position.top, minWidth: position.minWidth }} onKeyDown={keyDown}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" aria-selected={index === selected}
        aria-disabled={option.disabled || undefined} data-option-index={index} data-active={index === active}
        onPointerMove={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(index)}>{option.label}</div>)}
    </div>, document.body)}
  </>;
}
