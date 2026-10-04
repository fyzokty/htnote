import { useEffect, useState } from "react";
import { PanelLeft, Search } from "lucide-react";
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
 * ile pencereyi taşır ve çift tıklamada büyütür; sekmeler, düğmeler ve arama kutusu taşımaz.
 */
export function TitleBar() {
  const { t } = useTranslation();
  const platform = getPlatform();
  const customControls = usesCustomWindowControls(platform);
  const sidebarVisible = useUiStore((state) => state.sidebarVisible);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const openSearch = useUiStore((state) => state.openSearch);
  const [windowState, setWindowState] = useState<WindowState>({ maximized: false, focused: true });
  useEffect(() => subscribeWindowState(setWindowState), []);
  const searchShortcut = formatShortcut("globalSearch");

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
      <button type="button" data-testid="titlebar-search" onClick={openSearch} aria-label={t("titleBar.searchLabel")} className="htnote-titlebar-search">
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">{t("titleBar.search")}</span>
        <kbd aria-hidden>{searchShortcut}</kbd>
      </button>
      {customControls && <WindowControls maximized={windowState.maximized} />}
    </header>
  );
}
