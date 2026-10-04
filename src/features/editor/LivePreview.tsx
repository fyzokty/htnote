import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { parseBridgeMessage, registerFrame } from "@/features/viewer/bridgeHost";
import { ipc } from "@/lib/ipc";
import { getNoteOrigin, NOTE_IFRAME_SANDBOX, noteUrl } from "@/lib/noteUrl";

interface LivePreviewProps {
  noteId: string;
  html: string;
  css: string;
  js: string;
}

export function LivePreview({ noteId, html, css, js }: LivePreviewProps) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string>();
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const scrollY = useRef(0);
  const scrollToken = useRef<string | undefined>(undefined);
  const mounted = useRef(false);
  const draftNotes = useRef(new Set<string>());
  const activeNoteId = useRef(noteId);
  const frameSrc = src?.startsWith(`${getNoteOrigin()}/${encodeURIComponent(noteId)}/__draft/`) ? src : undefined;

  useEffect(() => {
    const frame = frameRef.current?.contentWindow;
    return frame ? registerFrame(`${noteId}:preview`, frame) : undefined;
  }, [noteId]);

  useEffect(() => {
    mounted.current = true;
    const notes = draftNotes.current;
    return () => {
      mounted.current = false;
      scrollY.current = 0;
      for (const id of notes) void ipc.clearPreviewDraft(id).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const noteChanged = activeNoteId.current !== noteId;
    if (noteChanged) {
      void ipc.clearPreviewDraft(activeNoteId.current).catch(() => {});
      activeNoteId.current = noteId;
      scrollY.current = 0;
      scrollToken.current = undefined;
      setSrc(undefined);
    }
    draftNotes.current.add(noteId);
    let current = true;
    const updateDraft = () => {
      setFailed(false);
      void ipc.setPreviewDraft(noteId, { html, css, js }).then((rev) => {
        if (current) {
          setLoadedSrc(undefined);
          setSrc(noteUrl(noteId, `__draft/${rev}/index.html`));
        }
        else if (!mounted.current || activeNoteId.current !== noteId) void ipc.clearPreviewDraft(noteId).catch(() => {});
      }).catch(() => { if (current) setFailed(true); });
    };
    const timer = noteChanged ? undefined : window.setTimeout(updateDraft, 300);
    if (noteChanged) updateDraft();
    return () => {
      current = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [noteId, html, css, js, retry]);

  useEffect(() => {
    scrollToken.current = undefined;
  }, [frameSrc]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow;
      if (!frame) return;
      const message = parseBridgeMessage(event, frame, getNoteOrigin());
      // Aynı iframe yeni revizyonda yeniden kullanılır; eski belgeden kuyrukta kalan olaylar yok sayılır.
      if (message?.type === "HTNOTE_READY" && event.data?.noteId === noteId && frameSrc
        && event.data?.path === new URL(frameSrc).pathname) {
        setLoadedSrc(frameSrc);
        setFailed(false);
      }
      if (!message || message.type !== "HTNOTE_SCROLL" || !frameSrc
        || event.data?.path !== new URL(frameSrc).pathname
        || event.data?.token !== scrollToken.current || !scrollToken.current) return;
      scrollY.current = message.scrollY;
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [noteId, frameSrc]);

  useEffect(() => {
    if (frameSrc && frameSrc === loadedSrc) return;
    const timer = window.setTimeout(() => setFailed(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [frameSrc, loadedSrc, noteId, retry]);

  const onLoad = () => {
    const frame = frameRef.current;
    if (!frame || !frameSrc || frame.src !== frameSrc) return;
    // Yeni belge yüklendikten sonra üretilen işaret eski belgenin kuyruktaki mesajlarını dışlar.
    const token = Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16).padStart(8, "0")).join("");
    scrollToken.current = token;
    frame.contentWindow?.postMessage({ type: "HTNOTE_SCROLL_RESTORE", scrollY: scrollY.current, token }, getNoteOrigin());
  };

  const loaded = !failed && !!frameSrc && loadedSrc === frameSrc;
  return <section className="htnote-preview-card" data-testid="live-preview" data-loaded={loaded} aria-busy={!loaded && !failed}>
    <header className="htnote-preview-header"><span className="htnote-preview-dot" aria-hidden="true" />{t("editor.split.livePreview")}</header>
    <div className="relative flex min-h-0 flex-1 flex-col">
    {!loaded && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-app-card text-sm text-app-muted">
      {failed ? <><span role="alert">{t("editor.split.loadError")}</span><Button size="sm" onClick={() => { setFailed(false); setSrc(undefined); setLoadedSrc(undefined); setRetry((value) => value + 1); }}>{t("editor.split.retry")}</Button></>
        : <span role="status">{t("common.loading")}</span>}
    </div>}
    <iframe key={noteId} ref={frameRef} title={t("editor.split.livePreview")} src={frameSrc ?? "about:blank"} onLoad={onLoad} onError={() => setFailed(true)} sandbox={NOTE_IFRAME_SANDBOX} referrerPolicy="no-referrer" className="min-h-0 flex-1 w-full border-0" />
    </div>
  </section>;
}
