import { useId, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { AlignCenter, AlignLeft, AlignRight, Check, Trash2, X } from "lucide-react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { AudioPlayer } from "@/components/ui/AudioPlayer";
import { resolveMediaSrc } from "@/features/editor/mediaSrc";

type Source = Record<string, string>;

function useToolbarSpace({ node, selected }: NodeViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const wrapper = ref.current;
    const toolbar = wrapper?.querySelector<HTMLElement>(".htnote-media-toolbar");
    if (!wrapper || !selected || !toolbar) return;
    const measure = () => { wrapper.style.paddingTop = `${toolbar.getBoundingClientRect().height + 8}px`; };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(toolbar);
    return () => { observer?.disconnect(); wrapper.style.paddingTop = ""; };
  }, [node, selected]);
  return ref;
}

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

function LayoutTools({ node, updateAttributes }: NodeViewProps) {
  const { t } = useTranslation();
  return <>
    {node.type.name !== "audio" && <div className="htnote-media-width" role="group" aria-label={t("editor.media.width")}>
      {(["25%", "50%", "100%", null] as const).map((value) => <Button size="sm" key={value ?? "original"} type="button"
        aria-pressed={(node.attrs.width ?? null) === value} onClick={() => updateAttributes({ width: value, align: node.attrs.align ?? "left" })}>
        {value ?? t("editor.image.original")}
      </Button>)}
    </div>}
    <div className="htnote-media-width" role="group" aria-label={t("editor.media.align")}>
      {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([value, Icon]) =>
        <IconButton size="sm" key={value} type="button" label={t(`editor.media.${value}`)}
          aria-pressed={(node.attrs.align ?? "left") === value} onClick={() => updateAttributes({ align: value })}>
          <Icon size={16} aria-hidden="true" />
        </IconButton>)}
    </div>
  </>;
}

function selectMedia(props: NodeViewProps, event: MouseEvent<HTMLElement>) {
  if (!(event.target as HTMLElement).closest(".htnote-media-preview")) return;
  const pos = props.getPos();
  if (typeof pos === "number") props.editor.commands.setNodeSelection(pos);
}

function ImageToolbar(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode } = props;
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
      <LayoutTools {...props} />
      <DeleteMedia kind="image" deleteNode={deleteNode} />
    </div>
  );
}

export function ImageView(props: NodeViewProps) {
  const { node, selected } = props;
  const ref = useToolbarSpace(props);
  return (
    <NodeViewWrapper ref={ref} className={`htnote-media htnote-media-image${selected ? " is-selected" : ""}`} contentEditable={false}
      onClick={(event: MouseEvent<HTMLElement>) => selectMedia(props, event)}>
      {selected && <ImageToolbar {...props} />}
      <img className="htnote-media-preview" src={resolveMediaSrc(noteIdFrom(props), node.attrs.src ?? "")} alt={node.attrs.alt ?? ""}
        title={node.attrs.title ?? undefined} style={{ width: node.attrs.width ? "100%" : undefined }} draggable={false} />
    </NodeViewWrapper>
  );
}

function PlaybackView(props: NodeViewProps & { kind: "audio" | "video" }) {
  const { t } = useTranslation();
  const { node, selected, kind, deleteNode } = props;
  const ref = useToolbarSpace(props);
  const src = resolveMediaSrc(noteIdFrom(props), node.attrs.src ?? "") || undefined;
  const sources = (node.attrs.sources as Source[]).map((source) => ({
    ...source, src: resolveMediaSrc(noteIdFrom(props), source.src ?? ""),
  }));
  return (
    <NodeViewWrapper ref={ref} className={`htnote-media htnote-media-${kind}${selected ? " is-selected" : ""}`} contentEditable={false}
      onClick={(event: MouseEvent<HTMLElement>) => selectMedia(props, event)}>
      {/* Kaynak değişince source alt öğelerinin tarayıcı tarafından yeniden seçilmesi gerekir. */}
      {kind === "audio" ? <AudioPlayer key={JSON.stringify([src, sources])} src={src} nameSrc={sources[0]?.src}
        title={node.attrs.title || undefined} loop={node.attrs.loop} muted={node.attrs.muted}>
        {sources.map((source, index) => <source key={index} {...source} />)}
      </AudioPlayer> : <video key={JSON.stringify([src, sources])} className="htnote-media-preview" src={src}
        poster={resolveMediaSrc(noteIdFrom(props), node.attrs.poster ?? "") || undefined}
        controls controlsList="nodownload" onContextMenu={(event) => event.preventDefault()}
        autoPlay={false} loop={node.attrs.loop} muted={node.attrs.muted} preload="metadata"
        style={{ width: node.attrs.width ? "100%" : undefined }}>
        {sources.map((source, index) => <source key={index} {...source} />)}
      </video>}
      {selected && <div className="htnote-media-toolbar" role="toolbar" aria-label={t(`editor.${kind}.toolbar`)} contentEditable={false}>
        <span>{t(`editor.${kind}.label`)}</span>
        <LayoutTools {...props} />
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
