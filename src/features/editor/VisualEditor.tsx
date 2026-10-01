import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useTranslation } from "react-i18next";

import { EditorToolbar } from "@/features/editor/EditorToolbar";
import { NotePicker } from "@/components/ui/NotePicker";
import { createVisualExtensions } from "@/features/editor/extensions";
import { escapeHtml, noteLinkHref } from "@/features/editor/noteLinks";
import { unwrapRawBlocks, wrapRawBlocks } from "@/features/editor/visualPipeline";
import type { FlatNote } from "@/lib/types";

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
    editorProps: { attributes: { "aria-label": t("editor.content") } },
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

  useEffect(() => () => { flush(); }, []);

  if (!visualAvailable || !editor) return null;
  return (
    <section className="htnote-visual-editor">
      <EditorToolbar editor={editor} onLinkNote={openPicker} />
      <EditorContent editor={editor} aria-label={t("editor.content")} />
      {pickerOpen && <NotePicker currentNoteId={noteId} onSelect={selectNote} onClose={() => setPickerOpen(false)} />}
    </section>
  );
});
