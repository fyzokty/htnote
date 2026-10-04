import { FileText, Search, X, CircleX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { useSearch } from "@/features/search/useSearch";
import { clearHighlight, requestHighlight } from "@/features/viewer/bridgeHost";
import { notifyError } from "@/lib/errors";
import { ipc } from "@/lib/ipc";
import { titleHighlights } from "./titleHighlights";
import { formatNavigationKey } from "@/lib/shortcuts/registry";
import type { SearchResult } from "@/lib/types";
import { useTabsStore } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";

function HighlightTitle({ title, query }: { title: string; query: string }) {
  return <>{titleHighlights(title, query).map((part, index) => part.match
    ? <mark key={index} className="htnote-search-match">{part.text}</mark> : <span key={index}>{part.text}</span>)}</>;
}

export function SearchModal() {
  const { t } = useTranslation();
  const closeSearch = useUiStore((state) => state.closeSearch);
  const { query, setQuery, results, indexing, loading, error } = useSearch();
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    input.current?.focus();
    input.current?.select();
    return () => previous?.focus();
  }, []);

  async function open(result: SearchResult, background = false) {
    try { await ipc.readNote(result.id); }
    catch (error) { notifyError(error); return; }
    useTabsStore.getState().openNote(result.id, { activate: !background });
    const doc = useTabsStore.getState().tabs.find((tab) => tab.noteId === result.id)?.doc;
    clearHighlight(result.id);
    if (doc?.mode === "view") requestHighlight(result.id, query.trim());
    if (!background) closeSearch();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      const elements = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])];
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    }
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); closeSearch();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((current) => results.length ? (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0);
    } else if (event.key === "Enter" && event.target === input.current && results[selected]) {
      event.preventDefault(); void open(results[selected], event.ctrlKey || event.metaKey);
    }
  }

  return (
    <div role="presentation" className="htnote-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSearch(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={t("search.title")} onKeyDown={onKeyDown} className="htnote-dialog-surface htnote-search flex flex-col">
        <div className="htnote-search-header">
          <Search className="size-4 text-app-accent" aria-hidden />
          <h2 className="flex-1 text-sm font-semibold">{t("search.title")}</h2>
          <IconButton type="button" onClick={closeSearch} label={t("search.close")}><X className="size-4" aria-hidden /></IconButton>
        </div>
        <div className="htnote-search-input">
          <Search className="size-5 shrink-0 text-app-accent" aria-hidden />
          <input ref={input} data-testid="search-input" type="search" aria-label={t("search.placeholder")} placeholder={t("search.placeholder")} value={query} onChange={(event) => { setSelected(0); setQuery(event.target.value); }} />
          {query && <IconButton label={t("search.clear")} onClick={() => { setQuery(""); setSelected(0); input.current?.focus(); }}><CircleX className="size-4" aria-hidden /></IconButton>}
          <kbd className="htnote-kbd">{formatNavigationKey("Escape")}</kbd>
        </div>
        <div className="htnote-search-results min-h-0 overflow-y-auto">
          <div aria-live="polite">
            {indexing && <p className="htnote-search-state">{t("search.indexing")}</p>}
            {loading && <p className="htnote-search-state">{t("search.loading")}</p>}
            {error && <p role="alert" className="htnote-search-state text-app-danger">{t("search.error")}</p>}
            {query.trim().length < 2 && <p className="htnote-search-state">{t("search.prompt")}</p>}
            {!loading && query.trim().length >= 2 && results.length === 0 && !error && <p className="htnote-search-state">{t("search.empty")}</p>}
          </div>
          <div role="listbox" aria-label={t("search.results")}>
            {results.map((result, index) => (
              <Button variant="ghost" key={result.id} data-testid="search-result" type="button" role="option"
                aria-label={result.title} aria-selected={selected === index}
                onMouseEnter={() => setSelected(index)}
                onClick={(event) => {
                  const selection = window.getSelection();
                  if (event.detail > 0 && selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode) && event.currentTarget.contains(selection.focusNode)) return;
                  void open(result, event.ctrlKey || event.metaKey);
                }} className="htnote-search-result">
                <span className="flex items-center gap-2">
                  <FileText className="size-4 shrink-0" aria-hidden />
                  <span className="htnote-search-result-title min-w-0 flex-1 truncate text-base font-semibold"><HighlightTitle title={result.title} query={query} /></span>
                  <span data-testid="search-path-pill" className="htnote-search-pill">{result.relPath.split(/[\\/]/).slice(0, -1).join("/") || t("search.root")}</span>
                  <span data-testid="search-match-pill" className="htnote-search-pill">{t("search.matchCount", { count: result.matchCount })}</span>
                </span>
                <span className="mt-2 block line-clamp-2 pl-6 text-sm leading-6 text-app-muted">
                  {result.snippets.slice(0, 2).map((snippet, snippetIndex) => (
                    <span key={snippetIndex} data-testid="search-snippet" className="select-text block line-clamp-2 break-words">
                      {!snippet.before.startsWith("…") && <span aria-hidden>…</span>}<span>{snippet.before}</span>
                      <mark className="htnote-search-match">{snippet.match}</mark>
                      <span>{snippet.after}</span>{!snippet.after.endsWith("…") && <span aria-hidden>…</span>}
                    </span>
                  ))}
                </span>
              </Button>
            ))}
          </div>
        </div>
        <div className="htnote-search-footer">
          <span className="flex items-center gap-1.5"><kbd className="htnote-kbd">{formatNavigationKey("ArrowUp")}</kbd><kbd className="htnote-kbd">{formatNavigationKey("ArrowDown")}</kbd>{t("search.navigate")}<span aria-hidden>·</span><kbd className="htnote-kbd">{formatNavigationKey("Enter")}</kbd>{t("search.open")}<span aria-hidden>·</span><kbd className="htnote-kbd">{formatNavigationKey("Escape")}</kbd>{t("search.dismiss")}</span>
          <span aria-live="polite" data-testid="search-found">{t("search.found", { count: results.length })}</span>
        </div>
      </div>
    </div>
  );
}
