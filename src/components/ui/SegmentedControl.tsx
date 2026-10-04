import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { measureSegment } from "@/lib/segmentIndicator";

import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  tooltip?: string;
  testId?: string;
}

interface Props<T extends string> {
  label: string;
  compact?: boolean;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ label, value, options, onChange, compact = false }: Props<T>) {
  const root = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const measured = useRef(false);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const container = root.current!;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const button = container.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      const pill = indicator.current;
      if (!button || !pill) return;
      const bounds = measureSegment(button);
      pill.style.transition = measured.current && !reduced ? "transform 200ms cubic-bezier(0.16, 1, 0.3, 1), width 200ms cubic-bezier(0.16, 1, 0.3, 1)" : "none";
      pill.style.transform = `translateX(${bounds.left}px)`;
      pill.style.width = `${bounds.width}px`;
      pill.style.top = `${bounds.top}px`;
      pill.style.height = `${bounds.height}px`;
      // İlk konum tarayıcıya geçiş kapalıyken işlenir.
      if (!measured.current && bounds.width > 0) { pill.getBoundingClientRect(); measured.current = true; }
    };
    measure();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resize?.observe(container);
    container.querySelectorAll("button").forEach((button) => resize?.observe(button));
    const attributes = new MutationObserver(measure);
    attributes.observe(container, { attributes: true, attributeFilter: ["data-compact"] });
    void document.fonts?.ready.then(measure);
    document.fonts?.addEventListener("loadingdone", measure);
    return () => { alive = false; resize?.disconnect(); attributes.disconnect(); document.fonts?.removeEventListener("loadingdone", measure); };
  }, [value, options, compact, reduced]);
  return <div ref={root} role="group" aria-label={label} className="htnote-segmented-control" data-compact={compact}
    onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const index = buttons.indexOf(event.target as HTMLButtonElement);
      if (index < 0 || !buttons.length) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
      buttons[next].click();
    }}>
    <span ref={indicator} aria-hidden="true" className="htnote-segment-indicator" />
    {options.map((option) => <Tooltip key={option.value} label={option.tooltip ?? option.label}>
      <Button size="sm" variant="ghost" data-testid={option.testId} disabled={option.disabled}
        aria-label={option.label} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
        {option.icon}<span data-action-text>{option.label}</span>
      </Button>
    </Tooltip>)}
  </div>;
}
