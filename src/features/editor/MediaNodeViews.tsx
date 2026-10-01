import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";

import { resolveMediaSrc } from "@/features/editor/mediaSrc";

type Source = Record<string, string>;

function noteIdFrom(props: NodeViewProps): string {
  return (props.extension.options as { noteId: string }).noteId;
}

export function ImageView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, selected, updateAttributes, deleteNode } = props;
  const width = node.attrs.width as string | null;
  return (
    <NodeViewWrapper className="htnote-media-image">
      <img src={resolveMediaSrc(noteIdFrom(props), node.attrs.src ?? "")} alt={node.attrs.alt ?? ""}
        title={node.attrs.title ?? undefined} style={{ width: width ?? undefined }} draggable={false} />
      {selected && <div className="htnote-media-image-toolbar" contentEditable={false}>
        <label>{t("editor.image.alt")}
          <input aria-label={t("editor.image.alt")} value={node.attrs.alt ?? ""}
            onChange={(event) => updateAttributes({ alt: event.target.value })} />
        </label>
        {(["25%", "50%", "100%", null] as const).map((value) => (
          <button key={value ?? "original"} type="button" aria-pressed={width === value}
            onClick={() => updateAttributes({ width: value })}>
            {value ?? t("editor.image.original")}
          </button>
        ))}
        <button type="button" onClick={deleteNode}>{t("editor.image.delete")}</button>
      </div>}
    </NodeViewWrapper>
  );
}

export function AudioView(props: NodeViewProps) {
  const { node } = props;
  return (
    <NodeViewWrapper className="htnote-media-audio">
      <audio src={resolveMediaSrc(noteIdFrom(props), node.attrs.src ?? "") || undefined}
        controls={node.attrs.controls} loop={node.attrs.loop} muted={node.attrs.muted} preload={node.attrs.preload ?? undefined}>
        {(node.attrs.sources as Source[]).map((source, index) =>
          <source key={index} {...source} src={resolveMediaSrc(noteIdFrom(props), source.src ?? "")} />)}
      </audio>
    </NodeViewWrapper>
  );
}

export function VideoView(props: NodeViewProps) {
  const { node } = props;
  return (
    <NodeViewWrapper className="htnote-media-video">
      <video src={resolveMediaSrc(noteIdFrom(props), node.attrs.src ?? "") || undefined}
        poster={resolveMediaSrc(noteIdFrom(props), node.attrs.poster ?? "") || undefined}
        controls={node.attrs.controls} loop={node.attrs.loop} muted={node.attrs.muted} preload={node.attrs.preload ?? undefined}>
        {(node.attrs.sources as Source[]).map((source, index) =>
          <source key={index} {...source} src={resolveMediaSrc(noteIdFrom(props), source.src ?? "")} />)}
      </video>
    </NodeViewWrapper>
  );
}
