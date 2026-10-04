import { Settings2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { formatShortcut } from "@/lib/shortcuts/registry";
import { useTabsStore } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";

export function SidebarFooter() {
  const { t } = useTranslation();
  const activeId = useTabsStore((state) => state.activeId);
  const count = useUiStore((state) => state.trashCount);
  return <div className="shrink-0 border-t border-app-card-border p-2">
    <Button data-testid="trash" onClick={() => useTabsStore.getState().toggleSpecial("trash")} aria-pressed={activeId === "special:trash"} variant="ghost" className={`w-full justify-start gap-3 ${activeId === "special:trash" ? "bg-app-selected text-app-accent" : ""}`}><Trash2 className="size-4" aria-hidden />{t("sidebar.trash")}<span className="ml-auto rounded-full bg-app-subtle px-2 text-xs">{count}</span></Button>
    <Button data-testid="settings" aria-label={t("sidebar.settings")} onClick={() => useTabsStore.getState().toggleSpecial("settings")} aria-pressed={activeId === "special:settings"} variant="ghost" className={`w-full justify-start gap-3 ${activeId === "special:settings" ? "bg-app-selected text-app-accent" : ""}`}><Settings2 className="size-4" aria-hidden />{t("sidebar.settings")}<kbd className="htnote-shortcut-badge ml-auto">{formatShortcut("openSettings")}</kbd></Button>
  </div>;
}
