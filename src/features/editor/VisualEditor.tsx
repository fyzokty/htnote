import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useTranslation } from "react-i18next";

import { EditorToolbar } from "@/features/editor/EditorToolbar";
import { createVisualExtensions } from "@/features/editor/extensions";
import { unwrapRawBlocks, wrapRawBlocks } from "@/features/editor/visualPipeline";

interface VisualEditorProps {
  initialInner: string;
  onChange: (inner: string) => void;
  visualAvailable?: boolean;
  onEditInCode?: () => void;
}

export function VisualEditor({ initialInner, onChange, visualAvailable = true, onEditInCode }: VisualEditorProps) {
  const { t } = useTranslation();
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const onEditInCodeRef = useRef(onEditInCode);
  useEffect(() => { onEditInCodeRef.current = onEditInCode; }, [onEditInCode]);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseline = useRef<string | null>(null);
  const lastReported = useRef<string | null>(null);
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

  const editor = useEditor({
    // TipTap bu geri çağırmayı yalnızca NodeView buton olayı sırasında çalıştırır.
    // eslint-disable-next-line react-hooks/refs
    extensions: createVisualExtensions(t("editor.placeholder"), () => {
      flush();
      onEditInCodeRef.current?.();
    }),
    content: wrapRawBlocks(initialInner),
    immediatelyRender: false,
    editorProps: { attributes: { "aria-label": t("editor.content") } },
    onUpdate: ({ editor: current }) => {
      pending.current = current.getHTML();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 150);
    },
  });

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
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} aria-label={t("editor.content")} />
    </section>
  );
}
