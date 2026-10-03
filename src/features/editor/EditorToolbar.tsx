import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, Code2,
  Table2, Minus, Link2, Link2Off, Rows3, Columns3, Trash2, ImagePlus, Music, Video, Code, Undo2, Redo2,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { copyFilesSequentially, fileName, mediaFor } from "@/features/editor/fileDrop";
import { ipc } from "@/lib/ipc";
import { formatShortcut, getPlatform } from "@/lib/shortcuts/registry";
import { useUiStore } from "@/stores/uiStore";

interface EditorToolbarProps { editor: Editor; noteId?: string; onLinkNote?: () => void }

export function EditorToolbar({ editor, noteId = "", onLinkNote }: EditorToolbarProps) {
  const { t } = useTranslation();
  const [, setRevision] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState(false);
  const tiptapShortcut = (key: string, shift = false) => getPlatform() === "mac"
    ? `⌘${shift ? "⇧" : ""}${key}` : `Ctrl+${shift ? "Shift+" : ""}${key}`;

  useEffect(() => {
    const update = () => setRevision((revision) => revision + 1);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  const action = (label: string, icon: React.ReactNode, run: () => void, active = false, disabled = false, shortcut?: string, testId?: string) => (
    <IconButton size="sm" className="htnote-format-button" data-testid={testId} label={label} shortcut={shortcut}
      aria-pressed={active} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={run}>
      <span aria-hidden="true">{icon}</span>
    </IconButton>
  );

  const applyLink = () => {
    const url = linkUrl.trim();
    // Tehlikeli şemalar bağlantı olarak belgeye yazılmamalı.
    if (!/^(https?:|mailto:|#|\/)/i.test(url) || url.startsWith("//")) {
      setLinkError(true);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
    setLinkError(false);
  };

  const addMedia = async (filter: { name: string; extensions: string[] }) => {
    const { from, to } = editor.state.selection;
    try {
      const selected = await open({
        multiple: true,
        filters: [filter],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const copied = await copyFilesSequentially(paths, (path) => ipc.copyAsset(noteId, path),
        (path) => useUiStore.getState().pushToast({ kind: "error", messageKey: "editor.dropCopyFailed", params: { name: fileName(path) } }));
      if (editor.isDestroyed || !copied.length) return;
      editor.chain().focus().setTextSelection({ from, to })
        .insertMedia(copied.map(({ result, path }) => mediaFor(result, fileName(path)))).run();
    } catch {
      useUiStore.getState().pushToast({ kind: "error", messageKey: "editor.mediaOpenFailed" });
    }
  };

  return (
    <div className="htnote-editor-bar htnote-editor-toolbar" role="toolbar" aria-label={t("editor.toolbar")}>
      <div className="htnote-editor-group" role="group" aria-label={t("editor.groups.history")}>
        {action(t("editor.undo"), <Undo2 size={16} />, () => editor.chain().focus().undo().run(), false, !editor.can().undo(), tiptapShortcut("Z"))}
        {action(t("editor.redo"), <Redo2 size={16} />, () => editor.chain().focus().redo().run(), false, !editor.can().redo(), tiptapShortcut("Z", true))}
      </div>
      <div className="htnote-editor-group" role="group" aria-label={t("editor.blockType")}>
        <Tooltip label={t("editor.blockType")}><select className="htnote-block-select" aria-label={t("editor.blockType")}
          value={editor.isActive("heading") ? `h${editor.getAttributes("heading").level}` : "p"}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "p") editor.chain().focus().setParagraph().run();
            else editor.chain().focus().setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
          }}>
          <option value="p">{t("editor.paragraph")}</option>
          {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={`h${level}`}>{t("editor.heading", { level })}</option>)}
        </select></Tooltip>
      </div>
      <div className="htnote-editor-group" role="group" aria-label={t("editor.groups.marks")}>
        {action(t("editor.bold"), <Bold size={16} />, () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"), !editor.can().toggleBold(), formatShortcut("editorBold"))}
        {action(t("editor.italic"), <Italic size={16} />, () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"), !editor.can().toggleItalic(), formatShortcut("editorItalic"))}
        {action(t("editor.underline"), <Underline size={16} />, () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"), !editor.can().toggleUnderline(), formatShortcut("editorUnderline"))}
        {action(t("editor.strike"), <Strikethrough size={16} />, () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"), !editor.can().toggleStrike(), tiptapShortcut("S", true))}
        {action(t("editor.inlineCode"), <Code size={16} />, () => editor.chain().focus().toggleCode().run(), editor.isActive("code"), !editor.can().toggleCode())}
      </div>
      <div className="htnote-editor-group" role="group" aria-label={t("editor.groups.blocks")}>
        {action(t("editor.bulletList"), <List size={16} />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
        {action(t("editor.orderedList"), <ListOrdered size={16} />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
        {action(t("editor.blockquote"), <Quote size={16} />, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
        {action(t("editor.codeBlock"), <Code2 size={16} />, () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive("codeBlock"))}
      </div>
      <div className="htnote-editor-group" role="group" aria-label={t("editor.groups.table")}>
        {action(t("editor.table"), <Table2 size={16} />, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
        {action(t("editor.addRow"), <Rows3 size={16} />, () => editor.chain().focus().addRowAfter().run(), false, !editor.can().addRowAfter())}
        {action(t("editor.deleteRow"), <Trash2 size={16} />, () => editor.chain().focus().deleteRow().run(), false, !editor.can().deleteRow())}
        {action(t("editor.addColumn"), <Columns3 size={16} />, () => editor.chain().focus().addColumnAfter().run(), false, !editor.can().addColumnAfter())}
        {action(t("editor.deleteColumn"), <Trash2 size={16} />, () => editor.chain().focus().deleteColumn().run(), false, !editor.can().deleteColumn())}
      </div>
      <div className="htnote-editor-group" role="group" aria-label={t("editor.groups.media")}>
        {action(t("editor.addImage"), <ImagePlus size={16} />, () => { void addMedia({ name: t("editor.mediaImages"), extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"] }); })}
        {action(t("editor.addAudio"), <Music size={16} />, () => { void addMedia({ name: t("editor.mediaAudio"), extensions: ["mp3", "wav", "ogg", "m4a"] }); })}
        {action(t("editor.addVideo"), <Video size={16} />, () => { void addMedia({ name: t("editor.mediaVideo"), extensions: ["mp4", "webm"] }); })}
      </div>
      <div className="htnote-editor-group" role="group" aria-label={t("editor.groups.links")}>
        {action(t("editor.addLink"), <Link2 size={16} />, () => {
          setLinkUrl(editor.getAttributes("link").href ?? "");
          setLinkError(false);
          setLinkOpen(true);
        }, editor.isActive("link"))}
        {onLinkNote && action(t("editor.linkNote"), <Link2 size={16} />, onLinkNote, false, false, formatShortcut("editorLink"), "link-note")}
        {action(t("editor.removeLink"), <Link2Off size={16} />, () => editor.chain().focus().unsetLink().run(), false, !editor.isActive("link"))}
        {action(t("editor.horizontalRule"), <Minus size={16} />, () => editor.chain().focus().setHorizontalRule().run())}
      </div>
      {linkOpen && <div className="htnote-editor-link">
        <input aria-label={t("editor.linkUrl")} type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") applyLink(); if (event.key === "Escape") setLinkOpen(false); }} />
        <Tooltip label={t("editor.applyLink")}><Button size="sm" variant="primary" onClick={applyLink}>{t("editor.applyLink")}</Button></Tooltip>
        <Tooltip label={t("editor.cancel")}><Button size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>{t("editor.cancel")}</Button></Tooltip>
        {linkError && <span role="alert">{t("editor.invalidLink")}</span>}
      </div>}
    </div>
  );
}
