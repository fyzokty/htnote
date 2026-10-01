import { useEffect, useRef, useState } from "react";

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
  const [src, setSrc] = useState<string>();
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
      void ipc.setPreviewDraft(noteId, { html, css, js }).then((rev) => {
        if (current) setSrc(noteUrl(noteId, `__draft/${rev}/index.html`));
        else if (!mounted.current || activeNoteId.current !== noteId) void ipc.clearPreviewDraft(noteId).catch(() => {});
      }).catch(() => {});
    };
    const timer = noteChanged ? undefined : window.setTimeout(updateDraft, 300);
    if (noteChanged) updateDraft();
    return () => {
      current = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [noteId, html, css, js]);

  useEffect(() => {
    scrollToken.current = undefined;
  }, [frameSrc]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow;
      if (!frame) return;
      const message = parseBridgeMessage(event, frame, getNoteOrigin());
      // Aynı iframe yeni revizyonda yeniden kullanılır; eski belgeden kuyrukta kalan olaylar yok sayılır.
      if (!message || message.type !== "HTNOTE_SCROLL" || !frameSrc
        || event.data?.path !== new URL(frameSrc).pathname
        || event.data?.token !== scrollToken.current || !scrollToken.current) return;
      scrollY.current = message.scrollY;
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [noteId, frameSrc]);

  const onLoad = () => {
    const frame = frameRef.current;
    if (!frame || !frameSrc || frame.src !== frameSrc) return;
    // Yeni belge yüklendikten sonra üretilen işaret eski belgenin kuyruktaki mesajlarını dışlar.
    const token = Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16).padStart(8, "0")).join("");
    scrollToken.current = token;
    frame.contentWindow?.postMessage({ type: "HTNOTE_SCROLL_RESTORE", scrollY: scrollY.current, token }, getNoteOrigin());
  };

  return <iframe key={noteId} ref={frameRef} title="Live preview" src={frameSrc ?? "about:blank"} onLoad={onLoad} sandbox={NOTE_IFRAME_SANDBOX} referrerPolicy="no-referrer" className="h-full w-full border-0" />;
}
