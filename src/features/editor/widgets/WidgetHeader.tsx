import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { WidgetBackgroundButton } from "./WidgetBackgroundButton";
import type { WidgetBackground } from "./widgetBackground";

interface Props {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  background: WidgetBackground;
  onBackgroundChange: (background: WidgetBackground) => void;
  selectLabel: string;
  onSelect: () => void;
}

export function WidgetHeader({ icon, label, children, background, onBackgroundChange, selectLabel, onSelect }: Props) {
  return <div className="htnote-widget-header">
    <span className="htnote-widget-type" role="img" aria-label={label} title={label}>{icon}</span>
    {children}
    <div className="htnote-widget-tools">
      <WidgetBackgroundButton value={background} onChange={onBackgroundChange} />
      <span className="htnote-widget-handle" data-block-handle draggable="false" role="button" tabIndex={0}
        aria-label={selectLabel} onClick={onSelect}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}><GripVertical size={15} aria-hidden /></span>
    </div>
  </div>;
}
