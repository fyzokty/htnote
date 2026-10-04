import { useLayoutEffect, useState, type RefObject } from "react";
import { fitNoteHeader } from "./headerLayout";

export function useHeaderLayout(ref: RefObject<HTMLDivElement | null>, contentKey: string, tagCount: number) {
  const [layout, setLayout] = useState<ReturnType<typeof fitNoteHeader> | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    const header = root?.parentElement;
    if (!root || !header) return;
    const naturalWidth = (selector: string) => root.querySelector<HTMLElement>(selector)?.getBoundingClientRect().width ?? 0;
    const measure = () => {
      const style = getComputedStyle(header);
      const available = header.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      if (!available) return;
      const actions = header.querySelector<HTMLElement>("[data-header-actions]");
      const savings = Array<number>(5).fill(0);
      let hiddenSavings = 0;
      actions?.querySelectorAll<HTMLElement>("[data-action-text]").forEach((label) => {
        const priority = Number(label.dataset.actionPriority ?? 3);
        const width = label.getBoundingClientRect().width + (parseFloat(getComputedStyle(label.parentElement!).columnGap) || 0);
        savings[priority - 1] += width;
        if (getComputedStyle(label).visibility === "hidden") hiddenSavings += width;
      });
      const gap = parseFloat(getComputedStyle(root).columnGap) || 8;
      const status = naturalWidth("[data-session-status]");
      const next = fitNoteHeader({ available: available - status - (status ? gap : 0),
        title: naturalWidth("[data-title-natural]"),
        path: naturalWidth("[data-path-natural]"), saved: naturalWidth("[data-saved-natural]"),
        tags: [...root.querySelectorAll<HTMLElement>("[data-tag-measure]")].map((tag) => tag.getBoundingClientRect().width),
        add: naturalWidth("[data-tag-add]"), overflow: naturalWidth("[data-tag-overflow-measure]"),
        actions: (actions?.getBoundingClientRect().width ?? 0) + hiddenSavings, actionSavings: savings, gap, actionGap: parseFloat(style.columnGap) || 8,
      });
      setLayout((old) => old && Object.keys(next).every((key) => old[key as keyof typeof next] === next[key as keyof typeof next]) ? old : next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(header);
    header.querySelectorAll<HTMLElement>('[data-header-actions], [data-action-text], [data-session-status], [data-testid="note-title"], [data-title-natural], [data-path-natural], [data-saved-natural], [data-tag-measure], [data-tag-add], [data-tag-overflow-measure]').forEach((element) => observer?.observe(element));
    let current = true;
    void document.fonts?.ready.then(() => { if (current) measure(); });
    return () => { current = false; observer?.disconnect(); };
  }, [ref, contentKey, tagCount]);
  return { titleWidth: layout?.title, pathWidth: layout?.path, savedWidth: layout?.saved, visibleTags: layout?.visibleTags ?? tagCount, compactLevel: layout?.compactLevel ?? 0 };
}
