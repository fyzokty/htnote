import type { ReactNode } from "react";

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
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ label, value, options, onChange }: Props<T>) {
  return <div role="group" aria-label={label} className="htnote-segmented-control"
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
    {options.map((option) => <Tooltip key={option.value} label={option.tooltip ?? option.label}>
      <Button size="sm" variant="ghost" data-testid={option.testId} disabled={option.disabled}
        aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
        {option.icon}{option.label}
      </Button>
    </Tooltip>)}
  </div>;
}
