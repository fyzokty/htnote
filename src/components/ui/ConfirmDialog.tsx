import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useUiStore } from "@/stores/uiStore";

export function ConfirmDialog() {
  const { t } = useTranslation();
  const dialog = useUiStore((state) => state.confirmDialog);
  const close = useUiStore((state) => state.closeConfirmDialog);
  const cancel = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dialog) return;
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
  }, [dialog, close]);

  if (!dialog) return null;
  const decide = (confirmed: boolean) => { dialog.resolve(confirmed); close(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" className="w-full max-w-md rounded-lg border border-app-border bg-app-surface p-5 text-app-text shadow-xl">
        <h2 id="confirm-title" className="text-lg font-semibold">{t(dialog.titleKey, { defaultValue: dialog.titleKey })}</h2>
        <p id="confirm-message" className="mt-2 text-sm text-app-muted">{t(dialog.messageKey, { ...dialog.params, defaultValue: dialog.messageKey })}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button ref={cancel} type="button" onClick={() => decide(false)}>{t("trash.cancel")}</button>
          <button type="button" onClick={() => decide(true)} className="rounded bg-red-600 px-3 py-1 text-white">{t("trash.confirm")}</button>
        </div>
      </div>
    </div>
  );
}
