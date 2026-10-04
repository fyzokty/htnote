import { useEffect, useState } from "react";
import { PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/IconButton";
import { TabBar } from "@/features/tabs/TabBar";
import { WindowControls } from "@/features/titlebar/WindowControls";
import { subscribeWindowState } from "@/features/titlebar/windowApi";
import type { WindowState } from "@/features/titlebar/windowApi";
import { getPlatform, usesCustomWindowControls } from "@/lib/platform";
import { formatShortcut } from "@/lib/shortcuts/registry";
import { useUiStore } from "@/stores/uiStore";

/**
 * Sistem başlık çubuğunun yerini alan üst satır (D29). Boş alanlar `data-tauri-drag-region`
 * ile pencereyi taşır ve çift tıklamada büyütür; sekmeler ve düğmeler taşımaz.
 */
export function TitleBar() {
  const { t } = useTranslation();
  const platform = getPlatform();
  const customControls = usesCustomWindowControls(platform);
  const sidebarVisible = useUiStore((state) => state.sidebarVisible);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const [windowState, setWindowState] = useState<WindowState>({ maximized: false, focused: true });
  useEffect(() => subscribeWindowState(setWindowState), []);

  return (
    <header data-tauri-drag-region data-testid="titlebar" data-platform={platform}
      data-window-focused={windowState.focused} aria-label={t("titleBar.label")}
      className="htnote-titlebar">
      {!customControls && <div data-tauri-drag-region className="htnote-titlebar-traffic-lights" aria-hidden />}
      <IconButton type="button" onClick={toggleSidebar} shortcut={formatShortcut("toggleSidebar")}
        label={sidebarVisible ? t("sidebar.hide") : t("sidebar.show")}
        className="htnote-titlebar-icon text-app-muted">
        <PanelLeft className="size-[18px]" aria-hidden />
      </IconButton>
      <TabBar />
      <div data-tauri-drag-region data-testid="titlebar-drag-region" className="htnote-titlebar-spacer" />
      {customControls && <WindowControls maximized={windowState.maximized} />}
    </header>
  );
}
