import { useId, useState } from "react";
import type { MouseEvent } from "react";
import { Check, Trash2, X } from "lucide-react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { resolveMediaSrc } from "@/features/editor/mediaSrc";

type Source = Record<string, string>;

function noteIdFrom(props: NodeViewProps): string {
  return (props.extension.options as { noteId: string }).noteId;
}

function DeleteMedia({ kind, deleteNode }: { kind: "image" | "audio" | "video"; deleteNode: () => void }) {
  const { t } = useTranslation();
  const label = t(`editor.${kind}.delete`);
  return <IconButton size="sm" variant="danger" className="htnote-media-delete" type="button" onClick={deleteNode} label={label}>
    <Trash2 size={16} aria-hidden="true" />
  </IconButton>;
}

function ImageToolbar({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const { t } = useTranslation();
  const id = useId();
  const originalAlt = (node.attrs.alt ?? "") as string;
  const [draft, setDraft] = useState({ saved: originalAlt, alt: originalAlt });
  if (draft.saved !== originalAlt) setDraft({ saved: originalAlt, alt: originalAlt });
  const alt = draft.alt;
  const setAlt = (value: string) => setDraft({ saved: originalAlt, alt: value });
  const applyAlt = () => updateAttributes({ alt });
  return (
    <div className="htnote-media-toolbar" role="toolbar" aria-label={t("editor.image.toolbar")} contentEditable={false}>
      <div className="htnote-media-alt">
        <label htmlFor={id}>{t("editor.image.alt")}</label>
        <input id={id} value={alt} placeholder={t("editor.image.altPlaceholder")}
          title={t("editor.image.altHint")} onChange={(event) => setAlt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              if (event.key === "Enter") applyAlt();
              else setAlt(originalAlt);
            }
          }} />
        <IconButton size="sm" type="button" onClick={applyAlt} disabled={alt === originalAlt}
          label={t("editor.image.applyAlt")}>
          <Check size={16} aria-hidden="true" />
        </IconButton>
        <IconButton size="sm" type="button" onClick={() => setAlt(originalAlt)} disabled={alt === originalAlt}
          label={t("editor.cancel")}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      </div>
      <div className="htnote-media-width" role="group" aria-label={t("editor.image.width")}>
        {(["25%", "50%", "100%", null] as const).map((value) => (
          <Button size="sm" key={value ?? "original"} type="button" aria-pressed={(node.attrs.width ?? null) === value}
            onClick={() => updateAttributes({ width: value })}>
            {value ?? t("editor.image.original")}
          </Button>
        ))}
      </div>
      <DeleteMedia kind="image" deleteNode={deleteNode} />
    </div>
  );
}

export function ImageView(props: NodeViewProps) {
  const { node, selected } = props;
  const width = node.attrs.width as string | null;
  const displayWidth = width && /^\d+(?:\.\d+)?$/.test(width) ? `${width}px` : width ?? undefined;
  return (
    <NodeViewWrapper className={`htnote-media htnote-media-image${selected ? " is-selected" : ""}`} contentEditable={false}>
      {selected && <ImageToolbar {...props} />}
      <img className="htnote-media-preview" src={resolveMediaSrc(noteIdFrom(props), node.attrs.src ?? "")} alt={node.attrs.alt ?? ""}
        title={node.attrs.title ?? undefined} style={{ width: displayWidth }} draggable={false} />
    </NodeViewWrapper>
  );
}

function PlaybackView(props: NodeViewProps & { kind: "audio" | "video" }) {
  const { t } = useTranslation();
  const { node, selected, kind, deleteNode } = props;
  const src = resolveMediaSrc(noteIdFrom(props), node.attrs.src ?? "") || undefined;
  const sources = (node.attrs.sources as Source[]).map((source) => ({
    ...source, src: resolveMediaSrc(noteIdFrom(props), source.src ?? ""),
  }));
  const Tag = kind;
  return (
    <NodeViewWrapper className={`htnote-media htnote-media-${kind}${selected ? " is-selected" : ""}`} contentEditable={false}
      onClick={(event: MouseEvent<HTMLElement>) => {
        if ((event.target as HTMLElement).closest(".htnote-media-toolbar")) return;
        const pos = props.getPos();
        if (typeof pos === "number") props.editor.commands.setNodeSelection(pos);
      }}>
      {/* Kaynak değişince source alt öğelerinin tarayıcı tarafından yeniden seçilmesi gerekir. */}
      <Tag key={JSON.stringify([src, sources])} className="htnote-media-preview" src={src}
        poster={kind === "video" ? resolveMediaSrc(noteIdFrom(props), node.attrs.poster ?? "") || undefined : undefined}
        controls autoPlay={false} loop={node.attrs.loop} muted={node.attrs.muted} preload="metadata">
        {sources.map((source, index) => <source key={index} {...source} />)}
      </Tag>
      {selected && <div className="htnote-media-toolbar" role="toolbar" aria-label={t(`editor.${kind}.toolbar`)} contentEditable={false}>
        <span>{t(`editor.${kind}.label`)}</span>
        <DeleteMedia kind={kind} deleteNode={deleteNode} />
      </div>}
    </NodeViewWrapper>
  );
}

export function AudioView(props: NodeViewProps) {
  return <PlaybackView {...props} kind="audio" />;
}

export function VideoView(props: NodeViewProps) {
  return <PlaybackView {...props} kind="video" />;
}
