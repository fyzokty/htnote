import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, Code2,
  Table2, Minus, Link2, Link2Off, Rows3, Columns3, Trash2, ImagePlus,
} from "lucide-react";

import { fileName, mediaFor, processFilesSequentially } from "@/features/editor/fileDrop";
import { ipc } from "@/lib/ipc";
import { useUiStore } from "@/stores/uiStore";

interface EditorToolbarProps { editor: Editor; noteId?: string; onLinkNote?: () => void }

export function EditorToolbar({ editor, noteId = "", onLinkNote }: EditorToolbarProps) {
  const { t } = useTranslation();
  const [, setRevision] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState(false);

  useEffect(() => {
    const update = () => setRevision((revision) => revision + 1);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  const action = (label: string, icon: React.ReactNode, run: () => void, active = false, disabled = false, shortcut?: string) => (
    <button type="button" aria-label={label} title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={run}>
      {icon}
    </button>
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

  const addMedia = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          { name: t("editor.mediaImages"), extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"] },
          { name: t("editor.mediaAudio"), extensions: ["mp3", "wav", "ogg", "m4a"] },
          { name: t("editor.mediaVideo"), extensions: ["mp4", "webm"] },
          { name: t("editor.mediaAll"), extensions: ["*"] },
        ],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      await processFilesSequentially(paths, (path) => ipc.copyAsset(noteId, path),
        (asset, path) => { editor.commands.insertMedia(mediaFor(asset, fileName(path))); },
        (path) => useUiStore.getState().pushToast({ kind: "error", messageKey: "editor.dropCopyFailed", params: { name: fileName(path) } }));
    } catch {
      useUiStore.getState().pushToast({ kind: "error", messageKey: "editor.mediaOpenFailed" });
    }
  };

  return (
    <div className="htnote-editor-toolbar" role="toolbar" aria-label={t("editor.toolbar")}>
      <select aria-label={t("editor.blockType")} title={t("editor.blockType")}
        value={editor.isActive("heading") ? `h${editor.getAttributes("heading").level}` : "p"}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "p") editor.chain().focus().setParagraph().run();
          else editor.chain().focus().setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
        }}>
        <option value="p">{t("editor.paragraph")}</option>
        {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={`h${level}`}>{t("editor.heading", { level })}</option>)}
      </select>
      {action(t("editor.bold"), <Bold size={16} />, () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"), !editor.can().toggleBold(), "Ctrl+B")}
      {action(t("editor.italic"), <Italic size={16} />, () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"), !editor.can().toggleItalic(), "Ctrl+I")}
      {action(t("editor.underline"), <Underline size={16} />, () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"), !editor.can().toggleUnderline(), "Ctrl+U")}
      {action(t("editor.strike"), <Strikethrough size={16} />, () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"), !editor.can().toggleStrike(), "Ctrl+Shift+S")}
      {action(t("editor.bulletList"), <List size={16} />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
      {action(t("editor.orderedList"), <ListOrdered size={16} />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {action(t("editor.blockquote"), <Quote size={16} />, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote"))}
      {action(t("editor.codeBlock"), <Code2 size={16} />, () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive("codeBlock"))}
      {action(t("editor.table"), <Table2 size={16} />, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      {action(t("editor.addRow"), <Rows3 size={16} />, () => editor.chain().focus().addRowAfter().run(), false, !editor.can().addRowAfter())}
      {action(t("editor.deleteRow"), <Trash2 size={16} />, () => editor.chain().focus().deleteRow().run(), false, !editor.can().deleteRow())}
      {action(t("editor.addColumn"), <Columns3 size={16} />, () => editor.chain().focus().addColumnAfter().run(), false, !editor.can().addColumnAfter())}
      {action(t("editor.deleteColumn"), <Trash2 size={16} />, () => editor.chain().focus().deleteColumn().run(), false, !editor.can().deleteColumn())}
      {action(t("editor.horizontalRule"), <Minus size={16} />, () => editor.chain().focus().setHorizontalRule().run())}
      {action(t("editor.addMedia"), <ImagePlus size={16} />, () => { void addMedia(); })}
      {action(t("editor.addLink"), <Link2 size={16} />, () => {
        setLinkUrl(editor.getAttributes("link").href ?? "");
        setLinkError(false);
        setLinkOpen(true);
      }, editor.isActive("link"))}
      {onLinkNote && action(t("editor.linkNote"), <Link2 size={16} />, onLinkNote, false, false, "Ctrl+K")}
      {action(t("editor.removeLink"), <Link2Off size={16} />, () => editor.chain().focus().unsetLink().run(), false, !editor.isActive("link"))}
      {linkOpen && <div className="htnote-editor-link">
        <input aria-label={t("editor.linkUrl")} type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") applyLink(); if (event.key === "Escape") setLinkOpen(false); }} />
        <button type="button" onClick={applyLink}>{t("editor.applyLink")}</button>
        <button type="button" onClick={() => setLinkOpen(false)}>{t("editor.cancel")}</button>
        {linkError && <span role="alert">{t("editor.invalidLink")}</span>}
      </div>}
    </div>
  );
}
