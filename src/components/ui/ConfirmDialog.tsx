import { DialogPresence } from "@/components/ui/DialogPresence";
import { useDialogActive, useDialogBackdrop } from "@/components/ui/useDialogPresence";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { useUiStore } from "@/stores/uiStore";

export function ConfirmDialog() {
  const dialog = useUiStore((state) => state.confirmDialog);
  return <DialogPresence>{dialog && <ConfirmDialogContent dialog={dialog} />}</DialogPresence>;
}

function ConfirmDialogContent({ dialog }: { dialog: NonNullable<ReturnType<typeof useUiStore.getState>["confirmDialog"]> }) {
  const active = useDialogActive();
  const backdrop = useDialogBackdrop();
  const { t } = useTranslation();
  const close = useUiStore((state) => state.closeConfirmDialog);
  const cancel = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dialog?.resolve(false);
        close();
      }
      if (event.key !== "Tab") return;
      const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault();
        buttons[buttons.length - 1]?.focus();
      } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
        event.preventDefault();
        buttons[0]?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [active, dialog, close]);

  const decide = (confirmed: boolean) => { dialog.resolve(confirmed); close(); };
  return (
    <div {...backdrop} className="htnote-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-app-backdrop p-4">
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" className="htnote-dialog-surface w-full max-w-md  p-5 text-app-text shadow-xl">
        <h2 id="confirm-title" className="text-lg font-semibold">{t(dialog.titleKey, { defaultValue: dialog.titleKey })}</h2>
        <p id="confirm-message" className="select-text mt-2 text-sm text-app-muted">{t(dialog.messageKey, { ...dialog.params, defaultValue: dialog.messageKey })}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button ref={cancel} type="button" onClick={() => decide(false)}>{t("trash.cancel")}</Button>
          <Button type="button" onClick={() => decide(true)} variant={dialog.options?.variant ?? "danger"}>{t(dialog.options?.labelKey ?? "trash.confirm", { defaultValue: dialog.options?.labelKey ?? "trash.confirm" })}</Button>
        </div>
      </div>
    </div>
  );
}
