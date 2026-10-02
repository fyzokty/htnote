import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createVisualExtensions } from "@/features/editor/extensions";
import { initNoteOrigin } from "@/lib/noteUrl";

let editor: Editor;
beforeEach(() => initNoteOrigin("http://127.0.0.1:4123"));
afterEach(() => editor?.destroy());

async function mount(content: string) {
  editor = new Editor({ extensions: createVisualExtensions("", undefined, undefined, "note"), content });
  const view = render(<EditorContent editor={editor} />);
  await act(async () => {});
  return view;
}

describe("media node views", () => {
  it("renders resolved image, poster and direct/nested media sources with controls and no autoplay", async () => {
    const view = await mount('<img src="./assets/a%20b.png" alt="Photo">' +
      '<audio src="./assets/a.wav" autoplay preload="none" loop muted></audio>' +
      '<audio autoplay><source src="./assets/b.wav" type="audio/wav" data-codec="pcm"></audio>' +
      '<video src="./assets/a.webm" poster="./assets/poster.png" autoplay></video>' +
      '<video autoplay><source src="./assets/b.webm" type="video/webm"></video>');
    expect(screen.getByRole("img", { name: "Photo" })).toHaveAttribute("src", "http://127.0.0.1:4123/note/assets/a%20b.png");
    const media = Array.from(view.container.querySelectorAll<HTMLMediaElement>("audio, video"));
    expect(media).toHaveLength(4);
    for (const element of media) {
      expect(element.controls).toBe(true);
      expect(element.autoplay).toBe(false);
      expect(element.paused).toBe(true);
      expect(element.preload).toBe("metadata");
    }
    expect(media[0]).toHaveAttribute("src", "http://127.0.0.1:4123/note/assets/a.wav");
    expect(media[0]).toHaveAttribute("loop");
    expect(media[1]).not.toHaveAttribute("src");
    expect(media[1].querySelector("source")).toHaveAttribute("src", "http://127.0.0.1:4123/note/assets/b.wav");
    expect(media[1].querySelector("source")).toHaveAttribute("data-codec", "pcm");
    expect(media[2]).toHaveAttribute("poster", "http://127.0.0.1:4123/note/assets/poster.png");
    expect(media[3].querySelector("source")).toHaveAttribute("src", "http://127.0.0.1:4123/note/assets/b.webm");
    // Editör önizleme tercihleri kaydedilen notun özniteliklerini değiştirmez.
    expect(editor.state.doc.child(1).attrs).toMatchObject({ src: "./assets/a.wav", autoplay: true, preload: "none", loop: true, muted: true });
    expect(editor.getHTML()).not.toContain("127.0.0.1");
    expect(editor.state.doc.child(1).attrs.controls).toBe(false);
  });

  it("applies alt text with Enter, cancels with Escape and offers explicit apply/cancel buttons", async () => {
    const view = await mount('<img src="./assets/photo.png" alt="Original"><p>After</p>');
    await act(async () => { editor.commands.setTextSelection(editor.state.doc.content.size - 1); });
    expect(screen.queryByRole("toolbar")).toBeNull();
    await act(async () => { editor.commands.setNodeSelection(0); });
    expect(view.container.querySelector(".htnote-media-image")).toHaveClass("is-selected");
    const input = () => screen.getByRole("textbox", { name: "Alternatif metin" });
    expect(input()).toHaveAttribute("placeholder", "Görseli kısaca açıklayın");
    fireEvent.change(input(), { target: { value: "New description" } });
    expect(editor.state.doc.firstChild?.attrs.alt).toBe("Original");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input()).toHaveValue("Original");
    fireEvent.change(input(), { target: { value: "New description" } });
    input().focus();
    await act(async () => { fireEvent.keyDown(input(), { key: "Enter" }); });
    expect(editor.state.doc.firstChild?.attrs.alt).toBe("New description");
    expect(input()).toHaveFocus();
    fireEvent.change(input(), { target: { value: "Cancelled" } });
    fireEvent.click(screen.getByRole("button", { name: "İptal" }));
    expect(input()).toHaveValue("New description");
    fireEvent.change(input(), { target: { value: "Applied" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Alternatif metni uygula" })); });
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Applied");
    fireEvent.click(screen.getByRole("button", { name: "Görseli sil" }));
    expect(editor.getHTML()).toBe("<p>After</p>");
  });

  it("shows selected width segments, applies percentages and restores original size", async () => {
    await mount('<img src="./assets/photo.png" alt="Photo" width="240">');
    await act(async () => { editor.commands.setNodeSelection(0); });
    expect(screen.getByRole("img")).toHaveStyle({ width: "240px" });
    for (const width of ["25%", "50%", "100%", "Özgün boyut"]) {
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: width })); });
      expect(screen.getByRole("button", { name: width })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getAllByRole("button").filter((button) => button.getAttribute("aria-pressed") === "true")).toHaveLength(1);
      expect(editor.state.doc.firstChild?.attrs.width).toBe(width === "Özgün boyut" ? null : width);
      expect(screen.getByRole("img").style.width).toBe(width === "Özgün boyut" ? "" : width);
    }
  });

  it.each(["audio", "video"] as const)("selects and deletes %s without intercepting native player events", async (kind) => {
    const view = await mount(`<${kind} src="./assets/media"></${kind}><p>Kept</p>`);
    const media = view.container.querySelector(kind)!;
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    fireEvent(media, mouseDown);
    expect(mouseDown.defaultPrevented).toBe(false);
    fireEvent.click(media);
    const label = kind === "audio" ? "Sesi sil" : "Videoyu sil";
    const button = screen.getByRole("button", { name: label });
    expect(button).toHaveAttribute("title", label);
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(button);
    expect(editor.getHTML()).toBe("<p>Kept</p>");
  });

  it.each(["audio", "video"] as const)("reloads %s when nested sources change", async (kind) => {
    const view = await mount(`<${kind}><source src="./assets/first" type="${kind}/webm"></${kind}>`);
    const previous = view.container.querySelector(kind);
    await act(async () => {
      editor.commands.setNodeSelection(0);
      editor.commands.updateAttributes(kind, { sources: [{ src: "./assets/second", type: `${kind}/webm` }] });
    });
    const current = view.container.querySelector(kind)!;
    expect(current).not.toBe(previous);
    expect(current.querySelector("source")).toHaveAttribute("src", "http://127.0.0.1:4123/note/assets/second");
    expect(current.autoplay).toBe(false);
  });
});
