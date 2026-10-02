import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Tags } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { deriveTags } from "@/features/tags/tags";
import { normalizeText } from "@/lib/textMatch";
import { useTreeStore } from "@/stores/treeStore";

function readExpanded(): boolean {
  try { return localStorage.getItem("htnote:tagsExpanded") !== "false"; }
  catch { return true; }
}

function writeExpanded(expanded: boolean): void {
  try { localStorage.setItem("htnote:tagsExpanded", String(expanded)); }
  catch { /* Depolama kullanılamazsa bölüm açık kalır. */ }
}

export function TagsSection() {
  const { t } = useTranslation();
  const tree = useTreeStore((state) => state.tree);
  const filterTag = useTreeStore((state) => state.filterTag);
  const setFilterTag = useTreeStore((state) => state.setFilterTag);
  const tags = useMemo(() => deriveTags(tree), [tree]);
  const [expanded, setExpanded] = useState(readExpanded);
  if (!tags.length) return null;
  return <section className="select-none shrink-0 px-3 py-2" aria-label={t("tags.title")}>
    <Button variant="ghost" size="sm" type="button" aria-expanded={expanded} onClick={() => { writeExpanded(!expanded); setExpanded(!expanded); }} className="flex w-full justify-start items-center gap-2 rounded px-2 py-1 text-left text-sm font-medium hover:bg-app-subtle">
      {expanded ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
      <Tags className="size-4" aria-hidden />{t("tags.title")}
    </Button>
    {expanded && <div className="max-h-48 overflow-y-auto">{tags.map(({ tag, count }) => <Button variant="ghost" size="sm" key={tag} type="button"
      aria-pressed={!!filterTag && normalizeText(filterTag) === normalizeText(tag)}
      onClick={() => setFilterTag(filterTag && normalizeText(filterTag) === normalizeText(tag) ? null : tag)}
      className="flex w-full justify-start items-center justify-between rounded px-8 py-1 text-left text-sm hover:bg-app-subtle"><span className="truncate">{tag}</span><span className="text-app-muted">{count}</span></Button>)}</div>}
  </section>;
}
