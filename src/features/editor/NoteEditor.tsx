import { useTranslation } from "react-i18next";

import { CodeEditor } from "@/features/editor/CodeEditor";
import { extractContent } from "@/features/editor/contentRegion";
import { LivePreview } from "@/features/editor/LivePreview";
import { SplitView } from "@/features/editor/SplitView";
import { VisualEditor } from "@/features/editor/VisualEditor";
import type { useEditSession } from "@/features/editor/useEditSession";
import type { DocState } from "@/features/editor/docState";

interface Props {
  noteId: string;
  doc: DocState;
  session: ReturnType<typeof useEditSession>;
}

export function NoteEditor({ noteId, doc, session }: Props) {
  const { t } = useTranslation();
  const draft = doc.draft;
  if (!draft) return null;
  const parts = extractContent(draft.html);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-app-border bg-app-surface px-4 py-2" role="toolbar" aria-label={t("editor.session.toolbar")}>
        <button type="button" disabled={doc.saving} onClick={() => { void session.save(false); }}>{t("editor.session.save")}</button>
        <button type="button" disabled={doc.saving} onClick={session.cancel}>{t("editor.session.cancel")}</button>
        <div role="group" aria-label={t("editor.session.mode")} className="ml-auto flex gap-2">
          <button type="button" aria-pressed={doc.mode === "visual"} disabled={!parts.ok} title={!parts.ok ? t("editor.session.visualUnavailable") : undefined} onClick={() => session.switchMode("visual")}>{t("editor.session.visual")}</button>
          <button type="button" aria-pressed={doc.mode === "code"} onClick={() => session.switchMode("code")}>{t("editor.session.code")}</button>
        </div>
      </div>
      {!parts.ok && <div role="status" className="border-b border-app-border px-4 py-2 text-sm text-app-muted">{t("editor.session.visualUnavailable")}</div>}
      <div className="min-h-0 flex-1 overflow-auto">
        {/* Ref yalnızca editörün bekleyen değişikliğini olay sırasında boşaltmak için aktarılır. */}
        {/* eslint-disable-next-line react-hooks/refs */}
        {doc.mode === "visual" && parts?.ok && <VisualEditor ref={session.visualRef} initialInner={parts.inner} onChange={session.onVisualChange} onEditInCode={() => session.switchMode("code")} />}
        {/* eslint-disable-next-line react-hooks/refs */}
        {doc.mode === "code" && <SplitView editor={<CodeEditor html={draft.html} css={draft.css ?? ""} js={draft.js ?? ""} onChange={session.onCodeChange} />}>
          <LivePreview noteId={noteId} html={draft.html} css={draft.css ?? ""} js={draft.js ?? ""} />
        </SplitView>}
      </div>
    </div>
  );
}
