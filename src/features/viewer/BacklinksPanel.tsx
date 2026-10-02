import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { fsChangeBus } from "@/lib/events";
import { ipc } from "@/lib/ipc";
import type { BacklinkItem, BrokenLinkItem } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTabsStore } from "@/stores/tabsStore";

export function BacklinksPanel({ id, saveRevision }: { id: string; saveRevision: string }) {
  const { t } = useTranslation();
  const expanded = useSettingsStore((state) => state.settings?.backlinksExpanded ?? true);
  const update = useSettingsStore((state) => state.update);
  const [backlinks, setBacklinks] = useState<BacklinkItem[]>([]);
  const [broken, setBroken] = useState<BrokenLinkItem[]>([]);
  const [revision, setRevision] = useState(0);

  useEffect(() => fsChangeBus.subscribe(() => setRevision((value) => value + 1)), []);
  useEffect(() => {
    let current = true;
    void Promise.all([ipc.getBacklinks(id), ipc.getBrokenLinks(id)]).then(([incoming, missing]) => {
      if (current) { setBacklinks(incoming); setBroken(missing); }
    }).catch(() => {
      if (current) { setBacklinks([]); setBroken([]); }
    });
    return () => { current = false; };
  }, [id, revision, saveRevision]);

  return (
    <section className="select-none shrink-0 border-t border-app-border bg-app-surface text-sm" aria-label={t("backlinks.title")}>
      <Button variant="ghost" size="sm" type="button" aria-expanded={expanded} onClick={() => { void update({ backlinksExpanded: !expanded }); }} className="w-full justify-start px-5 py-2 text-left font-medium">
        {t("backlinks.title")} ({backlinks.length})
      </Button>
      {expanded && <div className="max-h-48 overflow-auto px-5 pb-3">
        {backlinks.length === 0 && <p className="text-app-muted">{t("backlinks.empty")}</p>}
        {backlinks.map((item) => <Button variant="ghost" size="sm" key={item.id} type="button" onClick={() => useTabsStore.getState().openNote(item.id)} className="block w-full justify-start rounded px-2 py-1 text-left hover:bg-app-subtle">
          <span className="block font-medium">{item.title}</span>
          <span className="block text-xs text-app-muted">{item.relPath}</span>
          <span className="block text-xs">{item.snippet}</span>
        </Button>)}
        {broken.length > 0 && <div className="mt-2 border-t border-app-border pt-2">
          <h3 className="font-medium">{t("backlinks.broken")}</h3>
          <ul>{broken.map((item) => <li key={item.targetId} className="text-app-muted">{item.text} ({item.targetId})</li>)}</ul>
        </div>}
      </div>}
    </section>
  );
}
