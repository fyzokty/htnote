import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/IconButton";
import { closeWindow, minimizeWindow, subscribeMaximizeOverlay, toggleMaximizeWindow } from "@/features/titlebar/windowApi";
import type { MaximizeOverlayState } from "@/lib/events";

interface Props {
  maximized: boolean;
}

/** Windows 11 düzeninde Küçült · Ekranı kapla/Önceki boyuta getir · Kapat. */
export function WindowControls({ maximized }: Props) {
  const { t } = useTranslation();
  // Gerçek fare Windows'ta yerel Snap Layouts katmanına gider; hover/basılı durumu oradan gelir.
  const [overlay, setOverlay] = useState<MaximizeOverlayState>("idle");
  useEffect(() => subscribeMaximizeOverlay(setOverlay), []);
  const maximizeLabel = maximized ? t("titleBar.restore") : t("titleBar.maximize");

  return (
    <div role="group" aria-label={t("titleBar.windowControls")} className="htnote-caption-buttons">
      <IconButton type="button" data-testid="window-minimize" label={t("titleBar.minimize")} className="htnote-caption-button"
        onClick={() => { void minimizeWindow().catch(() => {}); }}>
        <Minus className="size-4" strokeWidth={1.25} aria-hidden />
      </IconButton>
      <IconButton type="button" data-testid="window-maximize" data-maximized={maximized} data-overlay-state={overlay}
        label={maximizeLabel} className="htnote-caption-button"
        onClick={() => { void toggleMaximizeWindow().catch(() => {}); }}>
        {maximized
          ? <Copy data-icon="restore" className="size-3.5 -scale-x-100" strokeWidth={1.25} aria-hidden />
          : <Square data-icon="maximize" className="size-3.5" strokeWidth={1.25} aria-hidden />}
      </IconButton>
      <IconButton type="button" data-testid="window-close" label={t("titleBar.close")} className="htnote-caption-button htnote-caption-close"
        onClick={() => { void closeWindow().catch(() => {}); }}>
        <X className="size-4" strokeWidth={1.25} aria-hidden />
      </IconButton>
    </div>
  );
}
