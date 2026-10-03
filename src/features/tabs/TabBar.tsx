import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/IconButton";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { restrictToTabStrip } from "@/features/tabs/dragModifier";
import { TabItem } from "@/features/tabs/TabItem";
import { resolveCreateTarget } from "@/features/tree/treeNavigation";
import { useTreeActions } from "@/features/tree/useTreeActions";
import { formatShortcut } from "@/lib/shortcuts/registry";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import { useSettingsStore } from "@/stores/settingsStore";
import { isSpecialTabId, useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";

interface MenuState { noteId: string; x: number; y: number; trigger: HTMLElement }

export function TabBar() {
  const { t } = useTranslation();
  const tabs = useTabsStore((state) => state.tabs);
  const activeId = useTabsStore((state) => state.activeId);
  const tabOrder = tabs.map((tab) => tab.noteId).join("\0");
  const sizing = useSettingsStore((state) => state.settings?.tabSizing ?? "fixed");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const { createNote } = useTreeActions((id) => useTabsStore.getState().openNote(id));

  useShortcut("closeTab", () => { const id = useTabsStore.getState().activeId; if (id) void useTabsStore.getState().close(id); });
  useShortcut("nextTab", () => useTabsStore.getState().next());
  useShortcut("prevTab", () => useTabsStore.getState().prev());

  useEffect(() => {
    if (!activeId) return;
    const active = [...(scrollArea.current?.children ?? [])].find((node) => node.getAttribute("data-note-id") === activeId);
    active?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeId, tabOrder, sizing]);

  useEffect(() => {
    const strip = scrollArea.current;
    if (!strip) return;
    const scroll = (event: WheelEvent) => {
      if (event.ctrlKey || strip.scrollWidth <= strip.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const pixels = delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1);
      const before = strip.scrollLeft;
      strip.scrollLeft += pixels;
      if (strip.scrollLeft !== before) event.preventDefault();
    };
    strip.addEventListener("wheel", scroll, { passive: false });
    return () => strip.removeEventListener("wheel", scroll);
  }, []);

  function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const from = tabs.findIndex((tab) => tab.noteId === event.active.id);
    const to = tabs.findIndex((tab) => tab.noteId === event.over?.id);
    useTabsStore.getState().move(from, to);
  }

  function openMenu(event: MouseEvent<HTMLDivElement>, noteId: string) {
    event.preventDefault();
    setMenu({ noteId, x: event.clientX, y: event.clientY, trigger: event.currentTarget });
  }

  function newNote() {
    const state = useTreeStore.getState();
    const parent = activeId && !isSpecialTabId(activeId) ? resolveCreateTarget({ kind: "note", id: activeId }, state.tree) : resolveCreateTarget(state.selected, state.tree);
    void createNote(parent);
  }

  return (
    <div className="flex h-full min-w-0 flex-1 items-center">
      <DndContext modifiers={[restrictToTabStrip]} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={tabs.map((tab) => tab.noteId)} strategy={horizontalListSortingStrategy}>
          <div ref={scrollArea} role="tablist" aria-label={t("tabs.label")} className="htnote-tab-strip isolate flex h-full min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
            {tabs.map((tab) => (
                <TabItem
                  key={tab.noteId}
                  special={tab.special}
                  sizing={sizing}
                  noteId={tab.noteId}
                  active={tab.noteId === activeId}
                  isDirty={tab.doc.dirty}
                  onActivate={() => useTabsStore.getState().activate(tab.noteId)}
                  onClose={() => { void useTabsStore.getState().close(tab.noteId); }}
                  onContextMenu={(event) => openMenu(event, tab.noteId)}
                />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <IconButton type="button" onClick={newNote} label={t("tabs.newNote")} className="mx-1 text-app-muted">
        <Plus className="size-4" aria-hidden />
      </IconButton>
      {menu && <ContextMenu x={menu.x} y={menu.y} trigger={menu.trigger} onClose={() => setMenu(null)} items={[
        { id: "close", label: t("tabs.close"), shortcut: formatShortcut("closeTab"), onSelect: () => { void useTabsStore.getState().close(menu.noteId); } },
        { id: "closeOthers", label: t("tabs.closeOthers"), onSelect: () => { void useTabsStore.getState().closeOthers(menu.noteId); } },
        ...(!isSpecialTabId(menu.noteId) ? [{ id: "reveal", label: t("tabs.revealInTree"), onSelect: () => useTreeStore.getState().revealNote(menu.noteId) }] : []),
      ]} />}
    </div>
  );
}
