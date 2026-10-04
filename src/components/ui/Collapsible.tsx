import type { ReactNode } from "react";
import { useDialogPresence } from "./useDialogPresence";

export function Collapsible({ open, animate = true, children, className = "", group = false, id }: {
  open: boolean;
  animate?: boolean;
  children: ReactNode | (() => ReactNode);
  className?: string;
  group?: boolean;
  id?: string;
}) {
  const { mounted } = useDialogPresence(open ? true : null, animate ? 140 : 0);
  const present = open || (animate && mounted);
  if (group && !present) return null;
  return <div id={id} role={group ? "group" : undefined} inert={!open} aria-hidden={!open || undefined}
    data-open={open} data-animate={animate} className={`htnote-collapse ${className}`}>
    <div className="htnote-collapse-inner">{present && (typeof children === "function" ? children() : children)}</div>
  </div>;
}
