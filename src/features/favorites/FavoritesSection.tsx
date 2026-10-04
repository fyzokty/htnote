import { useMemo, useState } from "react";
import { ChevronRight, FileText, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Collapsible } from "@/components/ui/Collapsible";
import { Button } from "@/components/ui/Button";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { deriveFavorites, toggleFavorite } from "@/features/favorites/favorites";
import { useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";

function readExpanded(): boolean {
  try {
    return localStorage.getItem("htnote:favoritesExpanded") !== "false";
  } catch {
    return true;
  }
}

function writeExpanded(expanded: boolean): void {
  try {
    localStorage.setItem("htnote:favoritesExpanded", String(expanded));
  } catch {
    // Depolama kullanılamasa da bölüm açık kalabilir.
  }
}

export function FavoritesSection({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const activeId = useTabsStore((state) => state.activeId);
  const tree = useTreeStore((state) => state.tree);
  const favorites = useMemo(() => deriveFavorites(tree), [tree]);
  const [expanded, setExpanded] = useState(readExpanded);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; trigger: HTMLElement } | null>(null);
  if (favorites.length === 0) return null;
  return (
    <section className="select-none shrink-0 px-3 py-2" aria-label={t("favorites.title")}>
      <Button data-testid="favorites-toggle" variant="ghost" size="sm" type="button" aria-label={t("favorites.title")} aria-expanded={expanded} onClick={() => { writeExpanded(!expanded); setExpanded(!expanded); }} className="flex w-full justify-start items-center gap-2 rounded px-2 py-1 text-left text-[11px] font-bold uppercase tracking-wider hover:bg-app-subtle">
        <ChevronRight className={`size-4 shrink-0 transition-transform duration-150 ease-out ${expanded ? "rotate-90" : "rotate-0"}`} aria-hidden data-state={expanded ? "open" : "closed"} />
        <Star className="size-4" aria-hidden />{t("favorites.title").toLocaleUpperCase(i18n.language)}
      </Button>
      <Collapsible open={expanded}><div className="htnote-tree-row htnote-sidebar-list overflow-y-auto">{favorites.map((note) => (
        <Button variant="ghost" size="sm" key={note.id} type="button" onClick={() => onOpenNote(note.id)} onContextMenu={(event) => { event.preventDefault(); setMenu({ id: note.id, x: event.clientX, y: event.clientY, trigger: event.currentTarget }); }} aria-pressed={activeId === note.id} className={`w-full justify-start truncate rounded px-6 py-1 text-left text-sm ${activeId === note.id ? "bg-app-selected text-app-accent" : "hover:bg-app-subtle"}`}><FileText className="size-4 shrink-0" aria-hidden /><span className="truncate">{note.title}</span></Button>
      ))}</div></Collapsible>
      {menu && <ContextMenu items={[{ id: "removeFavorite", label: t("favorites.remove"), onSelect: () => void toggleFavorite(menu.id, false) }]} x={menu.x} y={menu.y} trigger={menu.trigger} onClose={() => setMenu(null)} />}
    </section>
  );
}
