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
  const mounted = useRef(false);
  const draftNotes = useRef(new Set<string>());

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
    draftNotes.current.add(noteId);
    let current = true;
    const timer = window.setTimeout(() => {
      void ipc.setPreviewDraft(noteId, { html, css, js }).then((rev) => {
        if (current) setSrc(noteUrl(noteId, `__draft/${rev}/index.html`));
        else if (!mounted.current) void ipc.clearPreviewDraft(noteId).catch(() => {});
      }).catch(() => {});
    }, 300);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [noteId, html, css, js]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow;
      if (!frame) return;
      const message = parseBridgeMessage(event, frame, getNoteOrigin());
      if (message?.type === "HTNOTE_SCROLL") scrollY.current = message.scrollY;
      if (message?.type === "HTNOTE_READY") frame.postMessage({ type: "HTNOTE_SCROLL_RESTORE", scrollY: scrollY.current }, getNoteOrigin());
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return <iframe ref={frameRef} title="Live preview" src={src} sandbox={NOTE_IFRAME_SANDBOX} referrerPolicy="no-referrer" className="h-full w-full border-0" />;
}
