import type { ReactNode } from "react";
import { DialogActiveContext, useDialogActive, useDialogPresence } from "./useDialogPresence";

export function DialogPresence({ children }: { children: ReactNode }) {
  // Son içerik, kapanış sırasında aynı bileşen örneğinde korunur.
  const active = useDialogActive();
  const presence = useDialogPresence(children || null);
  return presence.mounted ? <DialogActiveContext value={active && !presence.closing}>{presence.content}</DialogActiveContext> : null;
}
