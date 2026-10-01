import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

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

export function RecoveryDialog({ candidates, onRecover, onIgnore }: Props) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
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
  }, [candidates.length]);

  if (!candidates.length) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="recovery-title" className="w-full max-w-lg rounded-lg border border-app-border bg-app-surface p-5 text-app-text shadow-xl">
      <h2 id="recovery-title" className="text-lg font-semibold">{t("recovery.title")}</h2>
      <p className="mt-2 text-sm text-app-muted">{t("recovery.description")}</p>
      <ul className="mt-4 max-h-80 space-y-3 overflow-auto">{candidates.map(({ draft, note, diskChanged }, index) => <li key={draft.id} className="rounded border border-app-border p-3">
        <p className="font-medium">{note.title}</p>
        <p className="text-sm text-app-muted">{t("recovery.savedAt", { time: new Date(draft.savedAt).toLocaleString() })}</p>
        {diskChanged && <p className="text-sm text-amber-600">{t("recovery.diskChanged")}</p>}
        <div className="mt-2 flex gap-2">
          <button ref={index === 0 ? first : undefined} type="button" onClick={() => onRecover(draft.id)} className="rounded bg-app-accent px-3 py-1 text-app-accent-text">{t("recovery.recover")}</button>
          <button type="button" onClick={() => onIgnore(draft.id)}>{t("recovery.ignore")}</button>
        </div>
      </li>)}</ul>
    </div>
  </div>;
}
