import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { createVisualExtensions } from "@/features/editor/extensions";

describe("insertMedia", () => {
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
