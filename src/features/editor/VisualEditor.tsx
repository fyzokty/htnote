import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useTranslation } from "react-i18next";

import { EditorToolbar } from "@/features/editor/EditorToolbar";
import { createVisualExtensions } from "@/features/editor/extensions";

interface VisualEditorProps {
  initialInner: string;
  onChange: (inner: string) => void;
  visualAvailable?: boolean;
}

export function VisualEditor({ initialInner, onChange, visualAvailable = true }: VisualEditorProps) {
  const { t } = useTranslation();
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: createVisualExtensions(t("editor.placeholder")),
    content: initialInner,
    immediatelyRender: false,
    editorProps: { attributes: { "aria-label": t("editor.content") } },
    onUpdate: ({ editor: current }) => {
      pending.current = current.getHTML();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        const html = pending.current;
        pending.current = null;
        if (html !== null) onChangeRef.current(html);
      }, 150);
    },
  });

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current !== null) onChangeRef.current(pending.current);
  }, []);

  if (!visualAvailable || !editor) return null;
  return (
    <section className="htnote-visual-editor">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} aria-label={t("editor.content")} />
    </section>
  );
}
