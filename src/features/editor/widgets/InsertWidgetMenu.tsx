import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { Blocks, TextCursorInput, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/ui/IconButton";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { PopoverPresence } from "@/components/ui/PopoverPresence";

const widgets = [
  { id: "textbox", label: "editor.textBox.insert", icon: TextCursorInput, insert: (editor: Editor) => editor.chain().focus().insertTextBox().run() },
  { id: "checklist", label: "editor.checklist.insert", icon: ListChecks, insert: (editor: Editor) => editor.chain().focus().insertChecklist().run() },
] as const;

export function InsertWidgetMenu({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const show = (trigger: HTMLElement) => setAnchor(trigger);
  const bounds = anchor?.getBoundingClientRect();
  return <>
    <IconButton size="sm" data-testid="insert-widget" label={t("editor.widgets.insert")} aria-haspopup="menu" aria-expanded={!!anchor}
      onMouseDown={(event) => event.preventDefault()} onClick={(event) => anchor ? close() : show(event.currentTarget)}
      onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); show(event.currentTarget); } }}>
      <Blocks size={16} aria-hidden />
    </IconButton>
    <PopoverPresence>{anchor && createPortal(<div className="htnote-widget-menu">
      <ContextMenu trigger={anchor} x={bounds!.left} y={bounds!.bottom + 4} onClose={close}
        items={widgets.map((widget) => ({ id: widget.id, testId: `insert-${widget.id}`, label: t(widget.label), icon: <widget.icon size={16} />, onSelect: () => widget.insert(editor) }))} />
    </div>, document.body)}</PopoverPresence>
  </>;
}
