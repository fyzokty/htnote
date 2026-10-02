import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { textMatch } from "@/lib/textMatch";
import type { FlatNote } from "@/lib/types";
import { useTreeStore } from "@/stores/treeStore";

interface NotePickerProps {
  currentNoteId: string;
  onSelect: (note: FlatNote) => void;
  onClose: () => void;
}

export function NotePicker({ currentNoteId, onSelect, onClose }: NotePickerProps) {
  const { t } = useTranslation();
  useTreeStore((state) => state.tree);
  const notes = useTreeStore.getState().flatNotes();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const filtered = notes.filter((note) => note.id !== currentNoteId && textMatch(note.title, query));

  useEffect(() => { input.current?.focus(); }, []);
  const move = (direction: number) => setActive((index) => (index + direction + filtered.length) % filtered.length);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    if (event.key === "ArrowDown" && filtered.length) { event.preventDefault(); move(1); }
    if (event.key === "ArrowUp" && filtered.length) { event.preventDefault(); move(-1); }
    if (event.key === "Enter" && filtered[active]) { event.preventDefault(); onSelect(filtered[active]); }
    if (event.key === "Tab") {
      const focusables = dialog.current?.querySelectorAll<HTMLElement>("button, input");
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };

  return <div className="htnote-note-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="htnote-note-picker" role="dialog" aria-modal="true" aria-label={t("notePicker.title")} onKeyDown={onKeyDown}>
      <div className="htnote-note-picker-header">
        <strong>{t("notePicker.title")}</strong>
        <IconButton type="button" onClick={onClose} label={t("notePicker.close")}>×</IconButton>
      </div>
      <input ref={input} aria-label={t("notePicker.search")} value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} />
      <div role="listbox" aria-label={t("notePicker.results")}>
        {filtered.map((note, index) => <Button variant="ghost" key={note.id} type="button" role="option" aria-selected={active === index}
          onMouseEnter={() => setActive(index)} onClick={() => onSelect(note)}>
          <span>{note.title}</span><small>{note.relPath.split("/").slice(0, -1).join("/") || t("notePicker.root")}</small>
        </Button>)}
        {!filtered.length && <p>{t("notePicker.empty")}</p>}
      </div>
    </div>
  </div>;
}
