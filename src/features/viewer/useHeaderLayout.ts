import { useLayoutEffect, useState, type RefObject } from "react";
import { fitNoteHeader } from "./headerLayout";

export function useHeaderLayout(ref: RefObject<HTMLDivElement | null>, contentKey: string, tagCount: number) {
  const [layout, setLayout] = useState<{ path: number; saved: number; visibleTags: number } | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const naturalWidth = (selector: string) => root.querySelector<HTMLElement>(selector)?.getBoundingClientRect().width ?? 0;
    const measure = () => {
      const available = root.getBoundingClientRect().width;
      if (!available) return;
      const next = fitNoteHeader({ available,
        title: root.querySelector<HTMLElement>('[data-testid="note-title"]')?.scrollWidth ?? 0,
        path: naturalWidth("[data-path-natural]"), saved: naturalWidth("[data-saved-natural]"),
        tags: [...root.querySelectorAll<HTMLElement>("[data-tag-measure]")].map((tag) => tag.getBoundingClientRect().width),
        add: naturalWidth("[data-tag-add]"), overflow: naturalWidth("[data-tag-overflow-measure]"),
      });
      setLayout((old) => old?.path === next.path && old.saved === next.saved && old.visibleTags === next.visibleTags ? old : next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(root);
    root.querySelectorAll<HTMLElement>('[data-testid="note-title"], [data-path-natural], [data-saved-natural], [data-tag-measure], [data-tag-add], [data-tag-overflow-measure]').forEach((element) => observer?.observe(element));
    let current = true;
    void document.fonts?.ready.then(() => { if (current) measure(); });
    return () => { current = false; observer?.disconnect(); };
  }, [ref, contentKey, tagCount]);
  return { pathWidth: layout?.path, savedWidth: layout?.saved, visibleTags: layout?.visibleTags ?? tagCount };
}
