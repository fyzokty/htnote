import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Tags } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { deriveTags } from "@/features/tags/tags";
import { normalizeText } from "@/lib/textMatch";
import { useTreeStore } from "@/stores/treeStore";

import { TagColorPicker } from "./TagColorPicker";

function readExpanded(): boolean {
  try { return localStorage.getItem("htnote:tagsExpanded") !== "false"; }
  catch { return true; }
}

function writeExpanded(expanded: boolean): void {
  try { localStorage.setItem("htnote:tagsExpanded", String(expanded)); }
  catch { /* Depolama kullanılamazsa bölüm açık kalır. */ }
}

export function TagsSection() {
  const { t, i18n } = useTranslation();
  const tree = useTreeStore((state) => state.tree);
  const filterTag = useTreeStore((state) => state.filterTag);
  const setFilterTag = useTreeStore((state) => state.setFilterTag);
  const tags = useMemo(() => deriveTags(tree), [tree]);
  const [expanded, setExpanded] = useState(readExpanded);
  if (!tags.length) return null;
  return <section className="select-none shrink-0 px-3 py-2" aria-label={t("tags.title")}>
    <Button variant="ghost" size="sm" type="button" aria-label={t("tags.title")} aria-expanded={expanded} onClick={() => { writeExpanded(!expanded); setExpanded(!expanded); }} className="flex w-full justify-start items-center gap-2 rounded px-2 py-1 text-left text-[11px] font-bold uppercase tracking-wider hover:bg-app-subtle">
      {expanded ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
      <Tags className="size-4" aria-hidden />{t("tags.title").toLocaleUpperCase(i18n.language)}
    </Button>
    {expanded && <div className="max-h-48 overflow-y-auto">{tags.map(({ tag, count }) => <div key={tag} className="htnote-tag-row flex items-center"><TagColorPicker tag={tag} /><Button variant="ghost" size="sm" type="button"
      aria-pressed={!!filterTag && normalizeText(filterTag) === normalizeText(tag)}
      onClick={() => setFilterTag(filterTag && normalizeText(filterTag) === normalizeText(tag) ? null : tag)}
      className={`flex w-full min-w-0 items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-app-subtle ${filterTag && normalizeText(filterTag) === normalizeText(tag) ? "bg-app-selected text-app-accent" : ""}`}><span className="flex min-w-0 items-center gap-2"><span className="truncate">#{tag}</span></span><span className="text-app-muted">{count}</span></Button></div>)}</div>}
  </section>;
}
