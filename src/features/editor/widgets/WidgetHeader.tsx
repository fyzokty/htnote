import type { ReactNode } from "react";
import { WidgetBackgroundButton } from "./WidgetBackgroundButton";
import type { WidgetBackground } from "./widgetBackground";

interface Props {
  icon: ReactNode;
  label: string;
  background: WidgetBackground;
  onBackgroundChange: (background: WidgetBackground) => void;
  selectLabel: string;
  onSelect: () => void;
}

export function WidgetHeader({ icon, label, background, onBackgroundChange, selectLabel, onSelect }: Props) {
  return <div className="htnote-widget-header">
    <span className="htnote-widget-type"><span aria-hidden>{icon}</span>{label}</span>
    <div className="htnote-widget-tools">
      <WidgetBackgroundButton value={background} onChange={onBackgroundChange} />
      <span className="htnote-widget-handle" data-drag-handle draggable="true" role="button" tabIndex={0}
        aria-label={selectLabel} onClick={onSelect}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }} />
    </div>
  </div>;
}
