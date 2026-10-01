import { Editor } from "@tiptap/core";
import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CodeEditor } from "@/features/editor/CodeEditor";
import { createVisualExtensions } from "@/features/editor/extensions";
import { codeNoteLink, escapeHtml, noteLinkHref, parseNoteLinkId } from "@/features/editor/noteLinks";
import { useTreeStore } from "@/stores/treeStore";

const id = "11111111-1111-4111-8111-111111111111";

describe("note links", () => {
  it("wraps selected text and retains the href through a round trip", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>Hello world</p>" });
    editor.chain().setTextSelection({ from: 1, to: 6 }).setLink({ href: noteLinkHref(id) }).run();
    const html = editor.getHTML();
    expect(html).toContain(`href="htnote://note/${id}"`);
    expect(html).toContain(">Hello</a>");
    expect(html).not.toContain("htnote-note-link");
    editor.commands.setContent(html);
    expect(editor.getHTML()).toContain(`href="htnote://note/${id}"`);
    editor.destroy();
  });

  it("rejects javascript hrefs in the visual editor", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>Text</p>" });
    editor.chain().setTextSelection({ from: 1, to: 5 }).setLink({ href: "javascript:alert(1)" }).run();
    expect(editor.getHTML()).not.toContain("javascript:");
    editor.destroy();
  });

  it("inserts a title link and keeps broken-link decoration out of HTML", () => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p></p>" });
    editor.chain().focus().insertContent(`<a href="${noteLinkHref(id)}">${escapeHtml("A & B")}</a>`).run();
    expect(editor.getHTML()).toContain(`href="htnote://note/${id}"`);
    expect(editor.getHTML()).toContain("A &amp; B");
    expect(editor.view.dom.querySelector(".htnote-note-link-broken")).not.toBeNull();
    expect(editor.getHTML()).not.toContain("htnote-note-link-broken");
    editor.destroy();
  });

  it("escapes code links and rejects invalid IDs", () => {
    expect(codeNoteLink(id, 'A & <B> "C"')).toBe(`<a href="htnote://note/${id}">A &amp; &lt;B&gt; &quot;C&quot;</a>`);
    expect(parseNoteLinkId(noteLinkHref(id))).toBe(id);
    expect(parseNoteLinkId("javascript:alert(1)")).toBeNull();
    expect(() => noteLinkHref("../other")).toThrow();
  });

  it("opens the picker with Ctrl+K in HTML code and inserts an escaped anchor", async () => {
    useTreeStore.setState({ tree: [{ type: "note", id, title: 'A & <B> "C"', relPath: "A", isFavorite: false, tags: [], updatedAt: "" }] });
    const changes: string[] = [];
    const { container } = render(createElement(CodeEditor, {
      noteId: "22222222-2222-4222-8222-222222222222", html: "<p></p>", css: "", js: "",
      onChange: (partial) => { if (partial.html) changes.push(partial.html); },
    }));
    const content = container.querySelector(".cm-content");
    expect(content).not.toBeNull();
    fireEvent.keyDown(content!, { key: "k", ctrlKey: true });
    fireEvent.click(screen.getByRole("option", { name: /A & <B>/ }));
    await waitFor(() => expect(changes[changes.length - 1]).toContain(codeNoteLink(id, 'A & <B> "C"')));
  });
});
