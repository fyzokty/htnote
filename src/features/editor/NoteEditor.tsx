import { useTranslation } from "react-i18next";
import { Code2, LoaderCircle, PenLine, Save } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatShortcut } from "@/lib/shortcuts/registry";

import { CodeEditor } from "@/features/editor/CodeEditor";
import { ExternalChangeBanner } from "@/features/editor/ExternalChangeBanner";
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
      <div className="htnote-editor-bar htnote-session-bar" role="toolbar" aria-label={t("editor.session.toolbar")}>
        <SegmentedControl label={t("editor.session.mode")} value={doc.mode === "visual" ? "visual" : "code"}
          onChange={session.switchMode} options={[
            { value: "visual", label: t("editor.session.visual"), icon: <PenLine size={16} aria-hidden="true" />, disabled: !parts.ok,
              tooltip: !parts.ok ? t("editor.session.visualUnavailable") : undefined, testId: "visual-mode" },
            { value: "code", label: t("editor.session.code"), icon: <Code2 size={16} aria-hidden="true" />, testId: "code-mode" },
          ]} />
        {doc.dirty && <span className="htnote-editor-unsaved" role="status"><span aria-hidden="true" />{t("editor.session.unsaved")}</span>}
        <div className="htnote-session-actions">
          <Tooltip label={t("editor.session.cancel")}><Button size="sm" variant="ghost" disabled={doc.saving} onClick={session.cancel}>{t("editor.session.cancel")}</Button></Tooltip>
          <Tooltip label={t("editor.session.save")} shortcut={formatShortcut("save")}>
            <Button size="sm" variant="primary" data-testid="save-note" disabled={doc.saving} aria-busy={doc.saving}
              onClick={() => { void session.save(false); }}>
              {doc.saving ? <LoaderCircle size={16} aria-hidden="true" className="htnote-editor-spinner" /> : <Save size={16} aria-hidden="true" />}
              {t(doc.saving ? "editor.session.saving" : "editor.session.save")}
            </Button>
          </Tooltip>
        </div>
      </div>
      <ExternalChangeBanner noteId={noteId} doc={doc} />
      {!parts.ok && <div role="status" className="border-b border-app-border px-4 py-2 text-sm text-app-muted">{t("editor.session.visualUnavailable")}</div>}
      <div className="min-h-0 flex-1 overflow-auto">
        {/* Ref yalnızca editörün bekleyen değişikliğini olay sırasında boşaltmak için aktarılır. */}
        {/* eslint-disable-next-line react-hooks/refs */}
        {doc.mode === "visual" && parts?.ok && <VisualEditor key={doc.baseVersion} ref={session.visualRef} noteId={noteId} initialInner={parts.inner} onChange={session.onVisualChange} onEditInCode={() => session.switchMode("code")} />}
        {doc.mode === "code" && <SplitView editor={(previewToggle) => <CodeEditor key={doc.baseVersion} noteId={noteId} html={draft.html} css={draft.css ?? ""} js={draft.js ?? ""} onChange={session.onCodeChange} toolbarActions={previewToggle} />}>
          <LivePreview noteId={noteId} html={draft.html} css={draft.css ?? ""} js={draft.js ?? ""} />
        </SplitView>}
      </div>
    </div>
  );
}
