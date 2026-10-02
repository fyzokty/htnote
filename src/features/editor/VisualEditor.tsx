import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useTranslation } from "react-i18next";

import { EditorToolbar } from "@/features/editor/EditorToolbar";
import { NotePicker } from "@/components/ui/NotePicker";
import { classifyClipboard, decodeDataUrl, pasteFileName, rewriteDataUrlImages, shouldWarnExternalImages } from "@/features/editor/clipboardPaste";
import { createVisualExtensions } from "@/features/editor/extensions";
import { copyFilesSequentially, fileName, mediaFor, registerDropHandler } from "@/features/editor/fileDrop";
import type { InsertMediaOptions } from "@/features/editor/mediaNodes";
import { escapeHtml, noteLinkHref } from "@/features/editor/noteLinks";
import { unwrapRawBlocks, wrapRawBlocks } from "@/features/editor/visualPipeline";
import { ipc } from "@/lib/ipc";
import type { FlatNote } from "@/lib/types";
import { useUiStore } from "@/stores/uiStore";

interface VisualEditorProps {
  noteId?: string;
  initialInner: string;
  onChange: (inner: string) => void;
  visualAvailable?: boolean;
  onEditInCode?: () => void;
}

export interface VisualEditorHandle { flush: () => void }

export const VisualEditor = forwardRef<VisualEditorHandle, VisualEditorProps>(function VisualEditor({ noteId = "", initialInner, onChange, visualAvailable = true, onEditInCode }, ref) {
  const { t } = useTranslation();
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const onEditInCodeRef = useRef(onEditInCode);
  useEffect(() => { onEditInCodeRef.current = onEditInCode; }, [onEditInCode]);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseline = useRef<string | null>(null);
  const lastReported = useRef<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const selection = useRef<{ from: number; to: number } | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const openPicker = () => {
    const current = editorRef.current;
    if (!current) return;
    selection.current = { from: current.state.selection.from, to: current.state.selection.to };
    setPickerOpen(true);
  };
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const html = pending.current;
    pending.current = null;
    if (html !== null && html !== lastReported.current) {
      lastReported.current = html;
      onChangeRef.current(unwrapRawBlocks(html));
    }
  };
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
                const asset = await ipc.saveAssetBytes(noteId, pasteFileName(new Date(), file.type), new Uint8Array(await file.arrayBuffer()));
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
    return registerDropHandler(noteId, "visual", async (paths, point) => {
      const target = editor.view.posAtCoords({ left: point.x, top: point.y });
      if (!target) return;
      const copied = await copyFilesSequentially(paths, (path) => ipc.copyAsset(noteId, path),
        (path) => useUiStore.getState().pushToast({ kind: "error", messageKey: "editor.dropCopyFailed", params: { name: fileName(path) } }));
      if (editor.isDestroyed || !copied.length) return;
      editor.chain().setTextSelection(target.pos)
        .insertMedia(copied.map(({ result, path }) => mediaFor(result, fileName(path)))).run();
    });
  }, [editor, noteId]);

  useEffect(() => () => { flush(); }, []);

  if (!visualAvailable || !editor) return null;
  return (
    <section className="htnote-visual-editor">
      <EditorToolbar editor={editor} noteId={noteId} onLinkNote={openPicker} />
      <EditorContent editor={editor} aria-label={t("editor.content")} />
      {pickerOpen && <NotePicker currentNoteId={noteId} onSelect={selectNote} onClose={() => setPickerOpen(false)} />}
    </section>
  );
});
