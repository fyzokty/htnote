import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { AudioView, ImageView, VideoView } from "@/features/editor/MediaNodeViews";

export interface InsertMediaOptions {
  relPath: string;
  kind: "image" | "audio" | "video" | "file";
  name: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    insertMedia: { insertMedia: (options: InsertMediaOptions) => ReturnType };
  }
}

interface MediaOptions { noteId: string }
type SourceAttributes = Record<string, string>;

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

export const Image = Node.create<MediaOptions>({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addOptions() { return { noteId: "" }; },
  addAttributes() {
    return {
      src: { default: null }, alt: { default: null }, width: { default: null },
      height: { default: null }, loading: { default: null },
    };
  },
  parseHTML() { return [{ tag: "img" }]; },
  renderHTML({ HTMLAttributes }) { return ["img", mergeAttributes(HTMLAttributes)]; },
  addNodeView() { return ReactNodeViewRenderer(ImageView); },
});

export const Audio = Node.create<MediaOptions>({
  name: "audio",
  group: "block",
  atom: true,
  draggable: true,
  addOptions() { return { noteId: "" }; },
  addAttributes() { return playbackAttributes; },
  parseHTML() { return [{ tag: "audio" }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ["audio", mergeAttributes(mediaAttributes(HTMLAttributes)), ...sourceNodes(node.attrs.sources)];
  },
  addNodeView() { return ReactNodeViewRenderer(AudioView); },
});

export const Video = Node.create<MediaOptions>({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  addOptions() { return { noteId: "" }; },
  addAttributes() { return { ...playbackAttributes, poster: { default: null }, width: { default: null }, height: { default: null } }; },
  parseHTML() { return [{ tag: "video" }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ["video", mergeAttributes(mediaAttributes(HTMLAttributes)), ...sourceNodes(node.attrs.sources)];
  },
  addNodeView() { return ReactNodeViewRenderer(VideoView); },
});

export const InsertMedia = Extension.create({
  name: "insertMedia",
  addCommands() {
    return {
      insertMedia: ({ relPath, kind, name }) => ({ commands }) => {
        if (kind === "file") {
          return commands.insertContent({ type: "text", text: name, marks: [{ type: "link", attrs: { href: relPath } }] });
        }
        return commands.insertContent({ type: kind, attrs: { src: relPath } });
      },
    };
  },
});
