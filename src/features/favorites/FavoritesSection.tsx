import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContextMenu } from "@/components/ui/ContextMenu";
import { deriveFavorites, toggleFavorite } from "@/features/favorites/favorites";
import { useTreeStore } from "@/stores/treeStore";

export function FavoritesSection({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const { t } = useTranslation();
  const tree = useTreeStore((state) => state.tree);
  const favorites = useMemo(() => deriveFavorites(tree), [tree]);
  const [expanded, setExpanded] = useState(() => localStorage.getItem("htnote:favoritesExpanded") !== "false");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; trigger: HTMLElement } | null>(null);
  if (favorites.length === 0) return null;
  return (
    <section className="shrink-0 px-3 pt-2" aria-label={t("favorites.title")}>
      <button type="button" aria-expanded={expanded} onClick={() => { localStorage.setItem("htnote:favoritesExpanded", String(!expanded)); setExpanded(!expanded); }} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm font-medium hover:bg-app-subtle">
        {expanded ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        <Star className="size-4" aria-hidden />{t("favorites.title")}
      </button>
      {expanded && <div className="max-h-48 overflow-y-auto">{favorites.map((note) => (
        <button key={note.id} type="button" onClick={() => onOpenNote(note.id)} onContextMenu={(event) => { event.preventDefault(); setMenu({ id: note.id, x: event.clientX, y: event.clientY, trigger: event.currentTarget }); }} className="block w-full truncate rounded px-8 py-1 text-left text-sm hover:bg-app-subtle">{note.title}</button>
      ))}</div>}
      {menu && <ContextMenu items={[{ id: "removeFavorite", label: t("favorites.remove"), onSelect: () => void toggleFavorite(menu.id, false) }]} x={menu.x} y={menu.y} trigger={menu.trigger} onClose={() => setMenu(null)} />}
    </section>
  );
}
