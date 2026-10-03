import { ipc } from "@/lib/ipc";
import { notifyError } from "@/lib/errors";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { NOTE_BACKGROUNDS, readNoteBackground } from "./noteAppearance";
import { setNoteBackground } from "./setNoteBackground";

export function NoteAppearancePicker({ noteId, html, disabled }: { noteId: string; html: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const [diskHtml, setDiskHtml] = useState("");
  useEffect(() => {
    if (html) return;
    let active = true;
    void ipc.readNote(noteId).then((note) => { if (active) setDiskHtml(note.html); }).catch(notifyError);
    return () => { active = false; };
  }, [noteId, html]);
  const [busy, setBusy] = useState(false);
  return <ColorPicker label={t("colors.appearance")} value={readNoteBackground(html || diskHtml)} disabled={disabled || busy}
    options={NOTE_BACKGROUNDS.map((preset) => ({ value: preset, label: t(`colors.backgrounds.${preset}`), color: `var(--app-note-${preset})` }))}
    onChange={(value) => { setBusy(true); void setNoteBackground(noteId, value).finally(() => setBusy(false)); }} />;
}
