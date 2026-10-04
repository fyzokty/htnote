import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DocState } from "@/features/editor/docState";
import { ipc } from "@/lib/ipc";
import { countNoteText, type NoteCounts } from "./noteCounts";

export function NoteStatusBar({ id, doc, updatedAt }: { id: string; doc: DocState; updatedAt: string }) {
  const { t, i18n } = useTranslation();
  const [disk, setDisk] = useState<{ id: string; revision: string; html: string } | null>(null);
  const [result, setResult] = useState<{ id: string; counts: NoteCounts } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const revisionRef = useRef(0);
  const revision = `${updatedAt}:${doc.lastSavedAt}:${doc.baseVersion}`;
  const html = doc.mode !== "view" ? doc.draft?.html : disk?.id === id && disk.revision === revision ? disk.html : undefined;
  useEffect(() => {
    if (doc.mode !== "view") return;
    let current = true;
    void ipc.readNote(id).then((note) => { if (current && note) setDisk({ id, revision, html: note.html }); }).catch(() => {});
    return () => { current = false; };
  }, [id, revision, doc.mode]);
  useEffect(() => {
    if (typeof Worker === "undefined") return;
    let worker: Worker;
    try { worker = new Worker(new URL("./noteCounts.worker.ts", import.meta.url), { type: "module" }); }
    catch { return; }
    workerRef.current = worker;
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);
  useEffect(() => {
    const revision = ++revisionRef.current;
    if (html === undefined) return;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const fallback = () => {
      clearTimeout(fallbackTimer);
      workerRef.current?.terminate();
      workerRef.current = null;
      if (revision === revisionRef.current) setResult({ id, counts: countNoteText(html) });
    };
    const timer = setTimeout(() => {
      const worker = workerRef.current;
      if (worker) {
        worker.onmessage = (event: MessageEvent<{ revision: number; counts: NoteCounts }>) => {
          if (event.data.revision === revision && revision === revisionRef.current) {
            clearTimeout(fallbackTimer);
            setResult({ id, counts: event.data.counts });
          }
        };
        worker.onerror = fallback;
        worker.onmessageerror = fallback;
        fallbackTimer = setTimeout(fallback, 3000);
        try { worker.postMessage({ revision, html }); } catch { fallback(); }
      } else setResult({ id, counts: countNoteText(html) });
    }, 250);
    return () => {
      clearTimeout(timer);
      clearTimeout(fallbackTimer);
      if (workerRef.current) {
        workerRef.current.onerror = null;
        workerRef.current.onmessageerror = null;
        workerRef.current.onmessage = null;
      }
    };
  }, [id, html]);
  const state = doc.saving ? "saving" : doc.dirty ? "dirty" : "saved";
  const counts = result?.id === id ? result.counts : null;
  const number = new Intl.NumberFormat(i18n.language);
  return <footer data-testid="note-status" className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-app-card-border px-4 text-xs text-app-muted">
    <span className="flex items-center gap-2 whitespace-nowrap"><span className={`size-1.5 rounded-full ${state === "saved" ? "bg-app-success" : "bg-app-warning"}`} aria-hidden /><span role="status">{t(`status.${state}`)}</span><span>·</span><span>{t("status.encoding")}</span><span>·</span><span>{t("status.format")}</span></span>
    {counts && <span data-testid="note-counts" className="whitespace-nowrap">{t("status.words", { count: counts.words, value: number.format(counts.words) })} · {t("status.characters", { count: counts.characters, value: number.format(counts.characters) })}</span>}
  </footer>;
}
