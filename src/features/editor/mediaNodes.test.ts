import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { createVisualExtensions } from "@/features/editor/extensions";

describe("insertMedia", () => {
  it("inserts a media batch in order with one update and one undo step", () => {
    const editor = new Editor({ extensions: createVisualExtensions("") });
    const updates: string[] = [];
    editor.on("update", () => updates.push(editor.getHTML()));
    const items = [["first.png", "image"], ["second.png", "image"], ["third.png", "image"], ["song.mp3", "audio"]] as const;
    editor.commands.insertMedia(items.map(([name, kind]) => ({ relPath: `./assets/${name}`, kind, name })));
    expect(editor.getJSON().content?.map((node) => node.attrs?.src)).toEqual([
      "./assets/first.png", "./assets/second.png", "./assets/third.png", "./assets/song.mp3",
    ]);
    expect(updates).toHaveLength(1);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getHTML()).toBe("<p></p>");
    editor.destroy();
  });

  it("does not change the document for an empty batch", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>Keep</p>" });
    editor.commands.setTextSelection({ from: 1, to: 5 });
    expect(editor.commands.insertMedia([])).toBe(false);
    expect(editor.getHTML()).toBe("<p>Keep</p>");
    editor.destroy();
  });

  it("preserves links between media blocks in a mixed batch", () => {
    const editor = new Editor({ extensions: createVisualExtensions("") });
    editor.commands.insertMedia([
      { relPath: "./assets/photo.png", kind: "image", name: "Photo" },
      { relPath: "./assets/doc.pdf", kind: "file", name: "Document" },
      { relPath: "./assets/movie.mp4", kind: "video", name: "Movie" },
    ]);
    expect(editor.getHTML()).toContain('<img src="./assets/photo.png"><p><a');
    expect(editor.getHTML()).toContain('href="./assets/doc.pdf">Document</a></p><video src="./assets/movie.mp4"');
    editor.destroy();
  });

  it.each(["image", "audio", "video"] as const)("inserts a %s node", (kind) => {
    const editor = new Editor({ extensions: createVisualExtensions("") });
    expect(editor.commands.insertMedia({ relPath: `./assets/test.${kind}`, kind, name: "Test" })).toBe(true);
    const node = editor.state.doc.firstChild;
    expect(node?.type.name).toBe(kind);
    expect(node?.attrs.src).toBe(`./assets/test.${kind}`);
    editor.destroy();
  });

  it("inserts a file link", () => {
    const editor = new Editor({ extensions: createVisualExtensions("") });
    expect(editor.commands.insertMedia({ relPath: "./assets/file.pdf", kind: "file", name: "File" })).toBe(true);
    expect(editor.getHTML()).toContain('href="./assets/file.pdf"');
    expect(editor.getText()).toBe("File");
    editor.destroy();
  });
});
