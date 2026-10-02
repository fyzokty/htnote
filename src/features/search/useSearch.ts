import { useEffect, useRef, useState } from "react";

import { fsChangeBus } from "@/lib/events";
import { ipc } from "@/lib/ipc";
import type { SearchResult } from "@/lib/types";
import { useUiStore } from "@/stores/uiStore";

export function useSearch() {
  const [query, setQuery] = useState(() => useUiStore.getState().lastSearchQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [loading, setLoading] = useState(() => useUiStore.getState().lastSearchQuery.trim().length >= 2);
  const [error, setError] = useState(false);
  const sequence = useRef(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => fsChangeBus.subscribe((payload) => {
    if (!payload.treeChanged && !payload.changedNoteIds.length && !payload.removedNoteIds.length) return;
    sequence.current++;
    setResults([]);
    setIndexing(false);
    setLoading(query.trim().length >= 2);
    setError(false);
    setRevision((current) => current + 1);
  }), [query]);

  function changeQuery(next: string) {
    sequence.current++;
    setQuery(next);
    setResults([]);
    setIndexing(false);
    setLoading(next.trim().length >= 2);
    setError(false);
  }

  useEffect(() => {
    useUiStore.getState().setLastSearchQuery(query);
    const guard = sequence;
    const current = ++guard.current;
    if (query.trim().length < 2) {
      return;
    }
    const timer = setTimeout(() => {
      void ipc.searchNotes(query.trim()).then((response) => {
        if (guard.current !== current) return;
        setResults(response.results);
        setIndexing(response.indexing);
        setLoading(false);
      }).catch(() => {
        if (guard.current !== current) return;
        setResults([]);
        setLoading(false);
        setError(true);
      });
    }, 200);
    return () => { clearTimeout(timer); if (guard.current === current) guard.current++; };
  }, [query, revision]);

  return { query, setQuery: changeQuery, results, indexing, loading, error };
}
