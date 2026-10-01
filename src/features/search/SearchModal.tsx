import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { useSearch } from "@/features/search/useSearch";
import { requestHighlight } from "@/features/viewer/bridgeHost";
import type { SearchResult } from "@/lib/types";
import { useTabsStore } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";

export function SearchModal() {
  const { t } = useTranslation();
  const closeSearch = useUiStore((state) => state.closeSearch);
  const { query, setQuery, results, indexing, loading, error } = useSearch();
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  function open(result: SearchResult, background = false) {
    const doc = useTabsStore.getState().tabs.find((tab) => tab.noteId === result.id)?.doc;
    if (doc?.mode !== "visual" && doc?.mode !== "code") requestHighlight(result.id, query.trim());
    useTabsStore.getState().openNote(result.id, { activate: !background });
    if (!background) closeSearch();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeSearch();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((current) => results.length ? (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0);
    } else if (event.key === "Enter" && results[selected]) {
      event.preventDefault();
      open(results[selected], event.ctrlKey || event.metaKey);
    }
  }

  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSearch(); }}>
      <div role="dialog" aria-modal="true" aria-label={t("search.title")} onKeyDown={onKeyDown} className="flex max-h-[75vh] w-full max-w-2xl flex-col rounded-lg border border-app-border bg-app-surface p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{t("search.title")}</h2>
          <button type="button" onClick={closeSearch} aria-label={t("search.close")} className="rounded px-2 py-1 text-app-muted hover:bg-app-subtle">×</button>
        </div>
        <input ref={input} type="search" aria-label={t("search.placeholder")} placeholder={t("search.placeholder")} value={query} onChange={(event) => { setSelected(0); setQuery(event.target.value); }} className="mt-3 w-full rounded-md border border-app-border bg-app-bg px-3 py-2 outline-none focus:border-app-accent" />
        <div className="mt-2 flex gap-3 text-xs text-app-muted" aria-live="polite">
          {indexing && <span>{t("search.indexing")}</span>}
          {loading && <span>{t("search.loading")}</span>}
          {error && <span>{t("search.error")}</span>}
        </div>
        <div role="listbox" aria-label={t("search.results")} className="mt-2 min-h-0 overflow-y-auto">
          {!loading && query.trim().length >= 2 && results.length === 0 && !error && <p className="p-3 text-sm text-app-muted">{t("search.empty")}</p>}
          {results.map((result, index) => (
            <button key={result.id} type="button" role="option" aria-selected={selected === index} onMouseEnter={() => setSelected(index)} onClick={(event) => open(result, event.ctrlKey || event.metaKey)} className={`block w-full rounded-md p-3 text-left hover:bg-app-subtle ${selected === index ? "bg-app-subtle" : ""}`}>
              <span className="block font-medium">{result.title}</span>
              <span className="block truncate text-xs text-app-muted">{result.relPath.split("/").slice(0, -1).join("/") || t("search.root")}</span>
              <span className="block text-xs text-app-muted">{t("search.matchCount", { count: result.matchCount })}</span>
              {result.snippets.map((snippet, snippetIndex) => <span key={snippetIndex} className="block truncate text-sm"><span>{snippet.before}</span><mark>{snippet.match}</mark><span>{snippet.after}</span></span>)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
