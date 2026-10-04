import { useDialogActive, useDialogBackdrop } from "@/components/ui/useDialogPresence";
import { DialogPresence } from "@/components/ui/DialogPresence";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import type { NoteNode, RecoveryDraft } from "@/lib/types";

export interface RecoveryCandidate {
  draft: RecoveryDraft;
  note: NoteNode;
  diskChanged?: boolean;
}

interface Props {
  candidates: RecoveryCandidate[];
  onRecover: (id: string) => void;
  onIgnore: (id: string) => void;
}

export function RecoveryDialog(props: Props) {
  return <DialogPresence>{props.candidates.length > 0 && <RecoveryDialogContent {...props} />}</DialogPresence>;
}

function RecoveryDialogContent({ candidates, onRecover, onIgnore }: Props) {
  const active = useDialogActive();
  const backdrop = useDialogBackdrop();
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!active) return;
    if (!candidates.length) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    first.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      if (!buttons.length) return;
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault();
        buttons[buttons.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
        event.preventDefault();
        buttons[0].focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [active, candidates.length]);

  return <div {...backdrop} className="htnote-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-app-backdrop p-4">
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="recovery-title" className="htnote-dialog-surface w-full max-w-lg  p-5 text-app-text shadow-xl">
      <h2 id="recovery-title" className="text-lg font-semibold">{t("recovery.title")}</h2>
      <p className="mt-2 text-sm text-app-muted">{t("recovery.description")}</p>
      <ul className="mt-4 max-h-80 space-y-3 overflow-auto">{candidates.map(({ draft, note, diskChanged }, index) => <li key={draft.id} className="rounded border border-app-border p-3">
        <p className="font-medium">{note.title}</p>
        <p className="text-sm text-app-muted">{t("recovery.savedAt", { time: new Date(draft.savedAt).toLocaleString() })}</p>
        {diskChanged && <p className="text-sm text-app-warning">{t("recovery.diskChanged")}</p>}
        <div className="mt-2 flex gap-2">
          <Button ref={index === 0 ? first : undefined} type="button" onClick={() => onRecover(draft.id)} variant="primary">{t("recovery.recover")}</Button>
          <Button type="button" variant="danger" onClick={() => onIgnore(draft.id)}>{t("recovery.ignore")}</Button>
        </div>
      </li>)}</ul>
    </div>
  </div>;
}
