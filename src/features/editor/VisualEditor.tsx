import { DialogPresence } from "@/components/ui/DialogPresence";
import type { CSSProperties } from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Transaction } from "@tiptap/pm/state";
import { useTranslation } from "react-i18next";

import { EditorToolbar } from "@/features/editor/EditorToolbar";
import { NotePicker } from "@/components/ui/NotePicker";
import { classifyClipboard, decodeDataUrl, pasteFileName, rewriteDataUrlImages, shouldWarnExternalImages } from "@/features/editor/clipboardPaste";
import { createVisualExtensions } from "@/features/editor/extensions";
import { copyFilesSequentially, fileName, mediaFor, registerDropHandler, registerDropPreview } from "@/features/editor/fileDrop";
import { createNativeDropCursor, dropPosition } from "@/features/editor/dropCursor";
import type { InsertMediaOptions } from "@/features/editor/mediaNodes";
import { escapeHtml, noteLinkHref } from "@/features/editor/noteLinks";
import { serializeVisualHtml, wrapRawBlocks } from "@/features/editor/visualPipeline";
import { ipc } from "@/lib/ipc";
import type { FlatNote } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";

interface VisualEditorProps {
  surfaceStyle?: CSSProperties;
  noteId?: string;
  initialInner: string;
  contentIndent?: number;
  onChange: (inner: string) => void;
  visualAvailable?: boolean;
  onEditInCode?: () => void;
}

export interface VisualEditorHandle { flush: () => void }

export const VisualEditor = forwardRef<VisualEditorHandle, VisualEditorProps>(function VisualEditor({ surfaceStyle, noteId = "", initialInner, contentIndent = 0, onChange, visualAvailable = true, onEditInCode }, ref) {
  const { t } = useTranslation();
  const contentWidth = useSettingsStore((state) => state.settings?.contentWidth ?? "comfortable");
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const contentIndentRef = useRef(contentIndent);
  useEffect(() => { contentIndentRef.current = contentIndent; }, [contentIndent]);
  const onEditInCodeRef = useRef(onEditInCode);
  useEffect(() => { onEditInCodeRef.current = onEditInCode; }, [onEditInCode]);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseline = useRef<string | null>(null);
  const lastReported = useRef<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const selection = useRef<{ from: number; to: number } | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openPicker = () => {
    const current = editorRef.current;
    if (!current) return;
    selection.current = { from: current.state.selection.from, to: current.state.selection.to };
    setPickerOpen(true);
  };
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const html = pending.current;
    pending.current = null;
    if (html !== null && html !== lastReported.current) {
      lastReported.current = html;
      onChangeRef.current(serializeVisualHtml(html, contentIndentRef.current));
    }
  }, []);
  useImperativeHandle(ref, () => ({ flush }));

  const editor = useEditor({
    // TipTap bu geri çağırmayı yalnızca NodeView buton olayı sırasında çalıştırır.
    extensions: createVisualExtensions(t("editor.placeholder"), () => {
      flush();
      onEditInCodeRef.current?.();
    }, openPicker, noteId),
    content: wrapRawBlocks(initialInner),
    immediatelyRender: false,
    editorProps: {
      attributes: { "aria-label": t("editor.content") },
      handlePaste: (view, event) => {
        const data = event.clipboardData;
        if (!data) return false;
        const kind = classifyClipboard(data);
        if (kind === "externalImages") {
          if (shouldWarnExternalImages()) useUiStore.getState().pushToast({ kind: "info", messageKey: "editor.externalImageOffline" });
          return false;
        }
        if (kind === "plain") return false;
        const { from, to } = view.state.selection;
        if (kind === "files") {
          const files = Array.from(data.files);
          void (async () => {
            const media: InsertMediaOptions[] = [];
            for (const file of files) {
              try {
                const asset = await ipc.saveAssetBytes(noteId, file.type ? pasteFileName(new Date(), file.type) : file.name,
                  new Uint8Array(await file.arrayBuffer()));
                media.push(mediaFor(asset, file.name || pasteFileName(new Date(), file.type)));
              } catch {
                useUiStore.getState().pushToast({ kind: "error", messageKey: "editor.pasteFailed" });
              }
            }
            const current = editorRef.current;
            if (!current || current.isDestroyed || !media.length) return;
            current.chain().setTextSelection({ from, to }).insertMedia(media).run();
          })();
          return true;
        }
        const html = data.getData("text/html");
        void (async () => {
          try {
            const rewritten = await rewriteDataUrlImages(html, async (url) => {
              const { bytes, mime } = decodeDataUrl(url);
              return (await ipc.saveAssetBytes(noteId, pasteFileName(new Date(), mime), bytes)).relPath;
            });
            const current = editorRef.current;
            if (!current || current.isDestroyed) return;
            current.chain().focus().setTextSelection({ from, to }).insertContent(rewritten).run();
            if (classifyClipboard({ files: [], getData: () => rewritten }) === "externalImages" && shouldWarnExternalImages()) {
              useUiStore.getState().pushToast({ kind: "info", messageKey: "editor.externalImageOffline" });
            }
          } catch {
            useUiStore.getState().pushToast({ kind: "error", messageKey: "editor.pasteFailed" });
          }
        })();
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      pending.current = current.getHTML();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 150);
    },
  });
  editorRef.current = editor;

  useEffect(() => {
    const scroll = scrollRef.current;
    const toolbar = scroll?.querySelector<HTMLElement>(".htnote-editor-toolbar");
    if (!scroll || !toolbar) return;
    // Keep native scrollIntoView below the sticky card, also when its inline
    // link controls increase its height.
    const measure = () => {
      scroll.style.scrollPaddingTop = `${(parseFloat(getComputedStyle(toolbar).top) || 0) + toolbar.getBoundingClientRect().height + 8}px`;
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(toolbar);
    return () => observer?.disconnect();
  }, [editor, visualAvailable]);

  const selectNote = (note: FlatNote) => {
    if (!editor || !selection.current) return;
    const { from, to } = selection.current;
    const href = noteLinkHref(note.id);
    const chain = editor.chain().focus().setTextSelection({ from, to });
    if (from === to) chain.insertContent(`<a href="${href}">${escapeHtml(note.title)}</a>`).run();
    else chain.setLink({ href }).run();
    setPickerOpen(false);
  };

  useEffect(() => {
    if (editor && baseline.current === null) {
      baseline.current = editor.getHTML();
      lastReported.current = baseline.current;
    }
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const cursor = createNativeDropCursor(editor.view);
    const unregisterPreview = registerDropPreview(noteId, (point) => cursor.update(point));
    const unregisterDrop = registerDropHandler(noteId, "visual", async (paths, point) => {
      cursor.update(null);
      const target = dropPosition(editor.view, point);
      if (target === null) return;
      // Kopyalama sırasında yapılan düzenlemelerde hedef konumu belgeyle birlikte taşı.
      let position = target;
      const mapPosition = ({ transaction }: { transaction: Transaction }) => {
        position = transaction.mapping.map(position);
      };
      editor.on("transaction", mapPosition);
      try {
        const copied = await copyFilesSequentially(paths, (path) => ipc.copyAsset(noteId, path),
          (path) => useUiStore.getState().pushToast({ kind: "error", messageKey: "editor.dropCopyFailed", params: { name: fileName(path) } }));
        if (editor.isDestroyed || !copied.length) return;
        editor.commands.insertMedia(copied.map(({ result, path }) => mediaFor(result, fileName(path))), position);
      } finally { editor.off("transaction", mapPosition); }
    });
    return () => { unregisterDrop(); unregisterPreview(); cursor.destroy(); };
  }, [editor, noteId]);

  useEffect(() => () => { flush(); }, [flush]);

  if (!visualAvailable || !editor) return null;
  return (
    <section className="htnote-visual-editor" data-content-width={contentWidth}>
      <div ref={scrollRef} className="htnote-visual-scroll" style={surfaceStyle}>
        <EditorToolbar editor={editor} noteId={noteId} onLinkNote={openPicker} />
        <EditorContent editor={editor} className="htnote-visual-content" aria-label={t("editor.content")}
          onMouseDownCapture={(event) => {
            if (event.button !== 0 || event.target !== editor.view.dom && event.target !== event.currentTarget) return;
            const last = editor.view.dom.lastElementChild;
            if (!last || event.clientY > last.getBoundingClientRect().bottom) {
              event.preventDefault();
              event.stopPropagation();
              editor.commands.focus("end");
            }
          }} />
      </div>
      <DialogPresence>{pickerOpen && <NotePicker currentNoteId={noteId} onSelect={selectNote} onClose={() => setPickerOpen(false)} />}</DialogPresence>
    </section>
  );
});
