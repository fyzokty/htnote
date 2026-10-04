import { noteBackgroundStyle } from "@/features/viewer/noteAppearance";
import { useTranslation } from "react-i18next";
import { CodeEditor } from "@/features/editor/CodeEditor";
import { ExternalChangeBanner } from "@/features/editor/ExternalChangeBanner";
import { extractContent } from "@/features/editor/contentRegion";
import { LivePreview } from "@/features/editor/LivePreview";
import { SplitView } from "@/features/editor/SplitView";
import { VisualEditor } from "@/features/editor/VisualEditor";
import { visualContentIndent } from "@/features/editor/visualPipeline";
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
      <ExternalChangeBanner noteId={noteId} doc={doc} />
      {!parts.ok && <div role="status" className="border-b border-app-border px-4 py-2 text-sm text-app-muted">{t("editor.session.visualUnavailable")}</div>}
      <div className="min-h-0 flex-1 overflow-hidden">
        {doc.mode === "visual" && parts?.ok && (
          <div key="visual" className="h-full w-full htnote-mode-transition" data-mode="visual">
            {/* Ref yalnızca editörün bekleyen değişikliğini olay sırasında boşaltmak için aktarılır. */}
            {/* eslint-disable-next-line react-hooks/refs */}
            <VisualEditor surfaceStyle={noteBackgroundStyle(draft.html)} key={doc.baseVersion} ref={session.visualRef} noteId={noteId} initialInner={parts.inner} contentIndent={visualContentIndent(parts)} onChange={session.onVisualChange} onEditInCode={() => session.switchMode("code")} />
          </div>
        )}
        {doc.mode === "code" && (
          <div key="code" className="h-full w-full htnote-mode-transition" data-mode="code">
            <SplitView editor={(previewToggle) => <CodeEditor key={doc.baseVersion} noteId={noteId} html={draft.html} css={draft.css ?? ""} js={draft.js ?? ""} onChange={session.onCodeChange} toolbarActions={previewToggle} />}>
              <LivePreview noteId={noteId} html={draft.html} css={draft.css ?? ""} js={draft.js ?? ""} />
            </SplitView>
          </div>
        )}
      </div>
    </div>
  );
}
