import type { ReactNode } from "react";
import { DialogActiveContext, useDialogActive } from "./useDialogPresence";
import { usePresence } from "./usePresence";

export function PopoverPresence({ children }: { children: ReactNode }) {
  const active = useDialogActive();
  const presence = usePresence(children || null);
  return presence.mounted ? <DialogActiveContext value={active && !presence.closing}>{presence.content}</DialogActiveContext> : null;
}
