import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { deriveFavorites, toggleFavorite } from "@/features/favorites/favorites";
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
  const { t } = useTranslation();
  const tree = useTreeStore((state) => state.tree);
  const favorites = useMemo(() => deriveFavorites(tree), [tree]);
  const [expanded, setExpanded] = useState(readExpanded);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; trigger: HTMLElement } | null>(null);
  if (favorites.length === 0) return null;
  return (
    <section className="select-none shrink-0 px-3 pt-2" aria-label={t("favorites.title")}>
      <Button variant="ghost" size="sm" type="button" aria-expanded={expanded} onClick={() => { writeExpanded(!expanded); setExpanded(!expanded); }} className="flex w-full justify-start items-center gap-2 rounded px-2 py-1 text-left text-sm font-medium hover:bg-app-subtle">
        {expanded ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        <Star className="size-4" aria-hidden />{t("favorites.title")}
      </Button>
      {expanded && <div className="max-h-48 overflow-y-auto">{favorites.map((note) => (
        <Button variant="ghost" size="sm" key={note.id} type="button" onClick={() => onOpenNote(note.id)} onContextMenu={(event) => { event.preventDefault(); setMenu({ id: note.id, x: event.clientX, y: event.clientY, trigger: event.currentTarget }); }} className="block w-full justify-start truncate rounded px-8 py-1 text-left text-sm hover:bg-app-subtle">{note.title}</Button>
      ))}</div>}
      {menu && <ContextMenu items={[{ id: "removeFavorite", label: t("favorites.remove"), onSelect: () => void toggleFavorite(menu.id, false) }]} x={menu.x} y={menu.y} trigger={menu.trigger} onClose={() => setMenu(null)} />}
    </section>
  );
}
