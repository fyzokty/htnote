import { Code2, LoaderCircle, PenLine, Save, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatShortcut } from "@/lib/shortcuts/registry";
import { extractContent } from "./contentRegion";
import type { DocState } from "./docState";
import { saveStatus } from "./saveStatus";
import type { useEditSession } from "./useEditSession";

export function EditSessionStatus({ doc }: { doc: DocState }) {
  const { t } = useTranslation();
  const state = saveStatus(doc);
  return state === "saved" ? null : <span data-session-status className="htnote-editor-unsaved" role="status">
    <span aria-hidden="true" />{t(`status.${state}`)}
  </span>;
}

export function EditSessionHeader({ doc, session, compact = false }: {
  doc: DocState; session: ReturnType<typeof useEditSession>; compact?: boolean;
}) {
  const { t } = useTranslation();
  if (!doc.draft) return null;
  const parts = extractContent(doc.draft.html);
  return <div className="htnote-session-actions" role="toolbar" aria-label={t("editor.session.toolbar")}>
    <SegmentedControl compact={compact} label={t("editor.session.mode")} value={doc.mode === "visual" ? "visual" : "code"}
      onChange={session.switchMode} options={[
        { value: "visual", label: t("editor.session.visual"), icon: <PenLine size={16} aria-hidden="true" />, disabled: !parts.ok,
          tooltip: !parts.ok ? t("editor.session.visualUnavailable") : undefined, testId: "visual-mode" },
        { value: "code", label: t("editor.session.code"), icon: <Code2 size={16} aria-hidden="true" />, testId: "code-mode" },
      ]} />
    <Tooltip label={t("editor.session.cancel")}><Button size="sm" variant="secondary" aria-label={t("editor.session.cancel")}
      data-testid="cancel-edit" disabled={doc.saving} onClick={session.cancel}><X size={16} aria-hidden="true" /><span data-action-text data-action-priority="2">{t("editor.session.cancel")}</span></Button></Tooltip>
    <Tooltip label={t("editor.session.save")} shortcut={formatShortcut("save")}>
      <Button size="sm" variant="primary" data-testid="save-note" aria-label={t(doc.saving ? "editor.session.saving" : "editor.session.save")}
        disabled={doc.saving} aria-busy={doc.saving} onClick={() => { void session.save(false); }}>
        {doc.saving ? <LoaderCircle size={16} aria-hidden="true" className="htnote-editor-spinner" /> : <Save size={16} aria-hidden="true" />}
        <span data-action-text data-action-priority="5">{t(doc.saving ? "editor.session.saving" : "editor.session.save")}</span>
      </Button>
    </Tooltip>
  </div>;
}
