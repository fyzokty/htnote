import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { useUiStore } from "@/stores/uiStore";

export function Toaster() {
  const { t } = useTranslation();
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className={`pointer-events-auto flex items-center gap-3 rounded-lg border bg-app-surface p-3 text-app-text shadow-lg ${toast.kind === "error" ? "border-app-accent" : "border-app-border"}`}>
          <p className="select-text min-w-0 flex-1">{t(toast.messageKey, { ...toast.params, defaultValue: toast.messageKey })}</p>
          {toast.action && (
            <Button type="button" size="sm" variant="ghost" className="shrink-0 text-app-accent" onClick={() => { toast.action?.onClick(); dismissToast(toast.id); }}>
              {t(toast.action.labelKey, { defaultValue: toast.action.labelKey })}
            </Button>
          )}
          <IconButton size="sm" type="button" label={t("toast.dismiss")} className="text-app-muted" onClick={() => dismissToast(toast.id)}>
            <X size={18} aria-hidden="true" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
