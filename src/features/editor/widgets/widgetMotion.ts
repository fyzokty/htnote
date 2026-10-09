import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useCallback, useLayoutEffect, useRef } from "react";
import { readSystemReducedMotion } from "@/lib/motion";

export const widgetMotionKey = new PluginKey<DecorationSet>("widgetMotion");
export const widgetMotionReduced = () => {
  const dataset = document.documentElement.dataset.reducedMotion;
  return dataset !== undefined ? dataset === "true" : readSystemReducedMotion();
};

// İşaret yalnız ekleme komutundan gelir; belge öznitelikleri ve geçmiş değişmez.
export const WidgetMotion = Extension.create({
  name: "widgetMotion",
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: widgetMotionKey,
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, previous) => {
          let mapped = previous.map(tr.mapping, tr.doc);
          const finished = tr.getMeta("widgetMotionFinished") as number | undefined;
          if (finished !== undefined) mapped = mapped.remove(mapped.find().filter((decoration) => decoration.from === finished));
          const inserted = tr.getMeta(widgetMotionKey) as Node[] | undefined;
          if (!inserted?.length || widgetMotionReduced()) return mapped;
          const decorations: Decoration[] = [];
          tr.doc.descendants((node, position) => {
            if (inserted.includes(node)) decorations.push(Decoration.node(position, position + node.nodeSize, { class: "htnote-widget-enter" }));
          });
          return mapped.add(tr.doc, decorations);
        },
      },
      props: { decorations: (state) => widgetMotionKey.getState(state) },
      view: (view) => {
        const finish = (event: Event) => {
          const name = (event as AnimationEvent).animationName;
          const target = event.target;
          if (!(target instanceof Element) || !["htnote-widget-enter", "htnote-widget-pop", "htnote-widget-feedback"].includes(name)) return;
          // Yeniden başlatılan hareketin eski iptal olayı yeni hareketi kesmez.
          if (event.type === "animationcancel" && target.getAnimations?.().some((animation) => (animation as CSSAnimation).animationName === name && animation.playState === "running")) return;
          const decoration = widgetMotionKey.getState(view.state)?.find().find((entry) => view.nodeDOM(entry.from) === target);
          if (decoration) {
            // Belge ve seçim değişmeden yalnız biten görünüm işaretini kaldır.
            view.dispatch(view.state.tr.setMeta("widgetMotionFinished", decoration.from).setMeta("addToHistory", false));
          } else target.classList.remove(name);
        };
        view.dom.addEventListener("animationend", finish);
        view.dom.addEventListener("animationcancel", finish);
        return { destroy: () => {
          view.dom.removeEventListener("animationend", finish);
          view.dom.removeEventListener("animationcancel", finish);
        } };
      },
    })];
  },
});

export function playWidgetMotion(element: Element | null, kind: "enter" | "pop" | "feedback") {
  if (!element || widgetMotionReduced()) return;
  const className = `htnote-widget-${kind}`;
  element.classList.remove(className);
  // Aynı öğeye art arda gelen kullanıcı eylemleri kısa hareketi yeniden başlatır.
  void (element as HTMLElement).offsetWidth;
  element.classList.add(className);
}

export function useWidgetFeedback<T extends HTMLElement>(value: string, kind: "pop" | "feedback" = "feedback") {
  const element = useRef<T>(null);
  const previous = useRef(value);
  const pending = useRef(false);
  useLayoutEffect(() => {
    if (pending.current && previous.current !== value) playWidgetMotion(element.current, kind);
    pending.current = false;
    previous.current = value;
  });
  const ref = useCallback((next: T | null) => { element.current = next; }, []);
  return { ref, markChanged: () => { pending.current = true; } };
}

export function useWidgetRowMotion<T>(items: readonly T[]) {
  const container = useRef<HTMLDivElement>(null);
  const added = useRef<number[]>([]);
  useLayoutEffect(() => {
    for (const index of added.current) playWidgetMotion(container.current?.children[index] ?? null, "enter");
    added.current = [];
  }, [items]);
  const ref = useCallback((next: HTMLDivElement | null) => { container.current = next; }, []);
  return { ref, markAdded: (indices: number[]) => { added.current = indices; } };
}

export function useWidgetChipMotion(keys: string[]) {
  const container = useRef<HTMLDivElement>(null);
  const signature = JSON.stringify(keys);
  const previous = useRef(signature);
  const pending = useRef(false);
  useLayoutEffect(() => {
    const before = new Set<string>(JSON.parse(previous.current));
    const current = JSON.parse(signature) as string[];
    current.forEach((key, index) => {
      if (pending.current && !before.has(key)) playWidgetMotion(container.current?.children[index + 1] ?? null, "enter");
    });
    pending.current = false;
    previous.current = signature;
  });
  const ref = useCallback((next: HTMLDivElement | null) => { container.current = next; }, []);
  return { ref, markChanged: () => { pending.current = true; } };
}
