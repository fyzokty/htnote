import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { useSearch } from "@/features/search/useSearch";
import { clearHighlight, requestHighlight } from "@/features/viewer/bridgeHost";
import { notifyError } from "@/lib/errors";
import { ipc } from "@/lib/ipc";
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

  async function open(result: SearchResult, background = false) {
    try {
      await ipc.readNote(result.id);
    } catch (error) {
      notifyError(error);
      return;
    }
    useTabsStore.getState().openNote(result.id, { activate: !background });
    const doc = useTabsStore.getState().tabs.find((tab) => tab.noteId === result.id)?.doc;
    clearHighlight(result.id);
    if (doc?.mode === "view") requestHighlight(result.id, query.trim());
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
      void open(results[selected], event.ctrlKey || event.metaKey);
    }
  }

  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-start justify-center bg-app-backdrop px-4 pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSearch(); }}>
      <div role="dialog" aria-modal="true" aria-label={t("search.title")} onKeyDown={onKeyDown} className="flex max-h-[75vh] w-full max-w-2xl flex-col rounded-lg border border-app-border bg-app-surface p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{t("search.title")}</h2>
          <IconButton type="button" onClick={closeSearch} label={t("search.close")}>×</IconButton>
        </div>
        <input ref={input} data-testid="search-input" type="search" aria-label={t("search.placeholder")} placeholder={t("search.placeholder")} value={query} onChange={(event) => { setSelected(0); setQuery(event.target.value); }} className="mt-3 w-full rounded-md border border-app-border bg-app-bg px-3 py-2 outline-none focus:border-app-accent" />
        <div className="mt-2 flex gap-3 text-xs text-app-muted" aria-live="polite">
          {indexing && <span>{t("search.indexing")}</span>}
          {loading && <span>{t("search.loading")}</span>}
          {error && <span className="select-text">{t("search.error")}</span>}
        </div>
        <div role="listbox" aria-label={t("search.results")} className="mt-2 min-h-0 overflow-y-auto">
          {!loading && query.trim().length >= 2 && results.length === 0 && !error && <p className="p-3 text-sm text-app-muted">{t("search.empty")}</p>}
          {results.map((result, index) => (
            <Button
              variant="ghost"
              key={result.id}
              data-testid="search-result"
              type="button"
              role="option"
              aria-selected={selected === index}
              onMouseEnter={() => setSelected(index)}
              onClick={(event) => {
                const selection = window.getSelection();
                if (event.detail > 0 && selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode) && event.currentTarget.contains(selection.focusNode)) return;
                void open(result, event.ctrlKey || event.metaKey);
              }}
              className={`block w-full rounded-md p-3 text-left transition-colors duration-150 ease-out hover:bg-app-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent ${
                selected === index ? "bg-app-subtle" : ""
              }`}
            >
              <span className="block font-medium">{result.title}</span>
              <span className="block truncate text-xs text-app-muted">{result.relPath.split("/").slice(0, -1).join("/") || t("search.root")}</span>
              <span className="block text-xs text-app-muted">{t("search.matchCount", { count: result.matchCount })}</span>
              {result.snippets.map((snippet, snippetIndex) => (
                <span
                  key={snippetIndex}
                  data-testid="search-snippet"
                  className="select-text block line-clamp-2 text-sm text-app-text break-words"
                >
                  <span>{snippet.before}</span>
                  <mark className="rounded-xs bg-app-accent/20 px-0.5 font-medium text-app-text">{snippet.match}</mark>
                  <span>{snippet.after}</span>
                </span>
              ))}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
