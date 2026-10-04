import { useLayoutEffect, useState, type RefObject } from "react";
import { fitNoteHeader } from "./headerLayout";

function columnGap(element: Element, fallback: number) {
  const value = parseFloat(getComputedStyle(element).columnGap);
  return Number.isFinite(value) ? value : fallback;
}

export function measureHeaderActions(actions: HTMLElement | null) {
  const savings = Array<number>(5).fill(0);
  if (!actions) return { width: 0, savings };
  const clone = actions.cloneNode(true) as HTMLElement;
  clone.removeAttribute("data-header-actions");
  clone.setAttribute("aria-hidden", "true");
  clone.inert = true;
  Object.assign(clone.style, { position: "fixed", left: "0", top: "0", width: "max-content", visibility: "hidden", pointerEvents: "none" });
  const labels = [...clone.querySelectorAll<HTMLElement>("[data-action-text]")];
  labels.forEach((label) => {
    label.style.position = "static";
    label.style.width = "max-content";
  });
  actions.parentElement!.appendChild(clone);
  try {
    // Measure the natural layout rather than adding guessed label/gap savings to
    // an already compacted flex box. Its constraints can otherwise reserve
    // space that does not exist and keep saved metadata hidden after widening.
    labels.forEach((label) => {
      const priority = Number(label.dataset.actionPriority ?? 3);
      savings[priority - 1] += label.getBoundingClientRect().width + columnGap(label.parentElement!, 0);
    });
    return { width: clone.getBoundingClientRect().width, savings };
  } finally {
    clone.remove();
  }
}

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
      const measuredActions = measureHeaderActions(actions);
      const gap = columnGap(root, 8);
      const status = naturalWidth("[data-session-status]");
      const next = fitNoteHeader({ available: available - status - (status ? gap : 0),
        title: naturalWidth("[data-title-natural]"),
        path: naturalWidth("[data-path-natural]"), saved: naturalWidth("[data-saved-natural]"),
        tags: [...root.querySelectorAll<HTMLElement>("[data-tag-measure]")].map((tag) => tag.getBoundingClientRect().width),
        add: naturalWidth("[data-tag-add]"), overflow: naturalWidth("[data-tag-overflow-measure]"),
        actions: measuredActions.width, actionSavings: measuredActions.savings, gap, actionGap: columnGap(header, 8),
        tagGap: root.querySelector("[data-compact-tags]") ? columnGap(root.querySelector("[data-compact-tags]")!, 4) : 0,
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
