import { Extension, Node, mergeAttributes } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { AudioView, ImageView, VideoView } from "@/features/editor/MediaNodeViews";

export interface InsertMediaOptions {
  relPath: string;
  kind: "image" | "audio" | "video" | "file";
  name: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    insertMedia: { insertMedia: (options: InsertMediaOptions | InsertMediaOptions[], position?: number) => ReturnType };
  }
}

interface MediaOptions { noteId: string }
type SourceAttributes = Record<string, string>;

const alignment = {
  default: null,
  parseHTML: (element: HTMLElement) => {
    const value = element.getAttribute("data-align");
    return value && ["left", "center", "right"].includes(value) ? value : null;
  },
  renderHTML: (attributes: Record<string, unknown>) => attributes.align ? { "data-align": attributes.align } : {},
};

export function mediaWidth(width: unknown): string | undefined {
  if (typeof width !== "string" && typeof width !== "number") return undefined;
  const value = String(width);
  if (/^\d+(?:\.\d+)?$/.test(value)) return `${value}px`;
  return /^\d+(?:\.\d+)?(?:%|px)$/.test(value) ? value : undefined;
}

function layoutAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const align = attributes["data-align"];
  const width = mediaWidth(attributes.width);
  if (!align && !width?.endsWith("%")) return attributes;
  const layout = `display: block; max-width: 100%; margin-left: ${!align || align === "left" ? "0" : "auto"}; margin-right: ${align === "right" ? "0" : "auto"};${width ? ` width: ${width};` : ""}`;
  const preserved = String(attributes.style ?? "").split(";").filter((rule) =>
    rule.trim() && !/^(?:display|max-width|margin-left|margin-right|width)\s*:/i.test(rule.trim())).join(";");
  return { ...attributes, style: `${preserved ? `${preserved}; ` : ""}${layout}` };
}

const nodeViewOptions = {
  stopEvent: stopMediaEvent,
  className: "htnote-media-node",
  attrs: ({ node }: { node: import("@tiptap/pm/model").Node }) => ({
    "data-align": node.attrs.align ?? "left",
    style: `width: ${mediaWidth(node.attrs.width) ?? "fit-content"}; max-width: 100%;`,
  }),
};

function parseSources(element: HTMLElement): SourceAttributes[] {
  return Array.from(element.children).filter((child) => child.tagName.toLowerCase() === "source")
    .map((child) => Object.fromEntries(Array.from(child.attributes).map(({ name, value }) => [name, value])));
}

function mediaAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const { controls, loop, muted, autoplay, ...rest } = attributes;
  return {
    ...rest,
    ...(controls ? { controls: "" } : {}),
    ...(loop ? { loop: "" } : {}),
    ...(muted ? { muted: "" } : {}),
    ...(autoplay ? { autoplay: "" } : {}),
  };
}

function sourceNodes(sources: SourceAttributes[]): [string, SourceAttributes][] {
  return sources.map((attributes) => ["source", attributes]);
}

const playbackAttributes = {
  src: { default: null },
  controls: { default: true, parseHTML: (element: HTMLElement) => element.hasAttribute("controls") },
  loop: { default: false, parseHTML: (element: HTMLElement) => element.hasAttribute("loop") },
  muted: { default: false, parseHTML: (element: HTMLElement) => element.hasAttribute("muted") },
  autoplay: { default: false, parseHTML: (element: HTMLElement) => element.hasAttribute("autoplay") },
  preload: { default: null },
  sources: { default: [], parseHTML: parseSources, renderHTML: () => ({}) },
};

function stopMediaEvent({ event }: { event: Event }): boolean {
  return event.target instanceof Element && !!event.target.closest("audio, video, .ht-audio-card, .htnote-media-toolbar");
}

export const Image = Node.create<MediaOptions>({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addOptions() { return { noteId: "" }; },
  addAttributes() {
    return {
      src: { default: null }, alt: { default: null }, title: { default: null }, width: { default: null },
      height: { default: null }, loading: { default: null },
      align: alignment,
    };
  },
  parseHTML() { return [{ tag: "img" }]; },
  renderHTML({ HTMLAttributes }) { return ["img", mergeAttributes(layoutAttributes(HTMLAttributes))]; },
  addNodeView() { return ReactNodeViewRenderer(ImageView, nodeViewOptions); },
});

export const Audio = Node.create<MediaOptions>({
  name: "audio",
  group: "block",
  atom: true,
  draggable: true,
  addOptions() { return { noteId: "" }; },
  addAttributes() { return { ...playbackAttributes, align: alignment }; },
  parseHTML() { return [{ tag: "audio" }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ["audio", mergeAttributes(layoutAttributes(mediaAttributes(HTMLAttributes))), ...sourceNodes(node.attrs.sources)];
  },
  addNodeView() { return ReactNodeViewRenderer(AudioView, nodeViewOptions); },
});

export const Video = Node.create<MediaOptions>({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  addOptions() { return { noteId: "" }; },
  addAttributes() { return { ...playbackAttributes, align: alignment, poster: { default: null }, width: { default: null }, height: { default: null } }; },
  parseHTML() { return [{ tag: "video" }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ["video", mergeAttributes(layoutAttributes(mediaAttributes(HTMLAttributes))), ...sourceNodes(node.attrs.sources)];
  },
  addNodeView() { return ReactNodeViewRenderer(VideoView, nodeViewOptions); },
});

export const InsertMedia = Extension.create({
  name: "insertMedia",
  addCommands() {
    return {
      insertMedia: (options, position) => ({ commands }) => {
        const items = Array.isArray(options) ? options : [options];
        if (!items.length) return false;
        // Atomik medya seçili kalabilir; sonraki dosya onu değiştirmesin diye topluca eklenir.
        const content = items.map(({ relPath, kind, name }): JSONContent => kind === "file"
          ? { type: "text", text: name, marks: [{ type: "link", attrs: { href: relPath } }] }
          : { type: kind, attrs: { src: relPath } });
        return position === undefined ? commands.insertContent(content) : commands.insertContentAt(position, content);
      },
    };
  },
});
