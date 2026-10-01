import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { SUPPORTED } from "@/features/editor/blockClassifier";
import { createVisualExtensions } from "@/features/editor/extensions";

describe("visual schema", () => {
  it("serializes supported element tags", () => {
    const editor = new Editor({ extensions: createVisualExtensions("") });
    for (const html of ["<h1>x</h1>", "<p><strong>x</strong><em>y</em><u>z</u><s>w</s></p>", "<ul><li><p>x</p></li></ul>", "<blockquote><p>x</p></blockquote>", "<pre><code>x</code></pre>", "<hr>", "<table><tbody><tr><th><p>x</p></th><td><p>y</p></td></tr></tbody></table>"]) {
      editor.commands.setContent(html);
      const container = document.createElement("div");
      container.innerHTML = editor.getHTML();
      for (const element of container.querySelectorAll("*")) {
        expect(SUPPORTED.tags.has(element.tagName.toLowerCase())).toBe(true);
      }
    }
    editor.destroy();
  });
});
