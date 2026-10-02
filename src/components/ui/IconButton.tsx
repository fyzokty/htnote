import { Button } from "./Button";
import type { ButtonProps } from "./Button";
import { Tooltip } from "./Tooltip";

interface Props extends Omit<ButtonProps, "aria-label" | "title"> {
  label: string;
  shortcut?: string;
}

export function IconButton({ label, shortcut, variant = "ghost", className = "", ...props }: Props) {
  return <Tooltip label={label} shortcut={shortcut}>
    <Button {...props} variant={variant} aria-label={label} className={`htnote-icon-button ${className}`} />
  </Tooltip>;
}
