/// <reference types="node" />
import { createRef } from "react";
import { readFileSync } from "node:fs";
import { Editor } from "@tiptap/core";
import { EditorView } from "@tiptap/pm/view";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createVisualExtensions } from "@/features/editor/extensions";
import { VisualEditor } from "@/features/editor/VisualEditor";
import type { VisualEditorHandle } from "@/features/editor/VisualEditor";
import { fileName, getDropHandler, kindFromPath, updateDropPreview } from "@/features/editor/fileDrop";
import { ipc } from "@/lib/ipc";
import { initNoteOrigin } from "@/lib/noteUrl";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { useTreeStore } from "@/stores/treeStore";

function normalized(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("colgroup").forEach((element) => element.remove());
  container.querySelectorAll("[style], a[rel], a[target]").forEach((element) => {
    element.removeAttribute("style");
    element.removeAttribute("rel");
    element.removeAttribute("target");
  });
  if (container.lastElementChild?.outerHTML === "<p></p>") container.lastElementChild.remove();
  return container.innerHTML;
}

beforeEach(() => initNoteOrigin("http://127.0.0.1:4123"));
afterEach(() => {
  vi.useRealTimers();
  for (const toast of useUiStore.getState().toasts) useUiStore.getState().dismissToast(toast.id);
});

describe("VisualEditor", () => {
  it.each([false, true])("restores the captured note-link selection after dialog focus (range=%s)", (range) => {
    vi.useFakeTimers();
    const id = "11111111-1111-4111-8111-111111111111";
    useTreeStore.setState({ tree: [{ type: "note", id, title: "Target B", relPath: "Target B", isFavorite: false, tags: [], updatedAt: "" }] });
    const ref = createRef<VisualEditorHandle>();
    const onChange = vi.fn();
    const { container } = render(<VisualEditor ref={ref} initialInner="<p>BeforeAfter</p>" onChange={onChange} />);
    const surface = screen.getByRole("textbox", { name: "Not içeriği" });
    const editor = (surface as HTMLElement & { editor: Editor }).editor;
    act(() => { editor.commands.setTextSelection({ from: 7, to: range ? 12 : 7 }); });
    fireEvent.click(screen.getByTestId("link-note"));
    expect(screen.getByRole("textbox", { name: "Not ara" })).toHaveFocus();
    // Diyalog odaktayken editör seçimi değişse bile yakalanan konum kullanılmalı.
    act(() => { editor.commands.setTextSelection(1); });
    fireEvent.click(screen.getByRole("option", { name: "Target B" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector(`.tiptap a[href="htnote://note/${id}"]`)).toHaveTextContent(range ? "After" : "Target B");
    expect(onChange).not.toHaveBeenCalled();
    act(() => { ref.current?.flush(); });
    expect(onChange).toHaveBeenCalledOnce();
    expect(normalized(onChange.mock.calls[0][0] as string)).toBe(range
      ? `<p>Before<a href="htnote://note/${id}">After</a></p>`
      : `<p>Before<a href="htnote://note/${id}">Target B</a>After</p>`);
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("shows the native cursor while hovering and clears it on leave and drop", async () => {
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue({ pos: 2, inside: 0 });
    vi.spyOn(EditorView.prototype, "coordsAtPos").mockReturnValue({ left: 50, right: 50, top: 20, bottom: 44 });
    vi.spyOn(ipc, "copyAsset").mockResolvedValue({ relPath: "./assets/drop.svg", kind: "image", mime: "image/svg+xml" });
    const view = render(<VisualEditor noteId="note" initialInner="<p>Text</p>" onChange={vi.fn()} />);
    updateDropPreview("note", { x: 50, y: 30 });
    expect(document.querySelector(".htnote-native-drop-cursor")).toHaveStyle({ width: "2px", height: "24px" });
    updateDropPreview(null, null);
    expect(document.querySelector(".htnote-native-drop-cursor")).toBeNull();
    updateDropPreview("note", { x: 50, y: 30 });
    await act(async () => { await getDropHandler("note", "visual")!(["drop.svg"], { x: 50, y: 30 }); });
    expect(document.querySelector(".htnote-native-drop-cursor")).toBeNull();
    expect(view.container.querySelector("img")).toHaveAttribute("src", "http://127.0.0.1:4123/note/assets/drop.svg");
    view.unmount();
  });

  it("maps the captured drop point through edits made while copying assets", async () => {
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue({ pos: 7, inside: 0 });
    let resolveCopy!: (asset: { relPath: string; kind: "image"; mime: string }) => void;
    vi.spyOn(ipc, "copyAsset").mockReturnValue(new Promise((resolve) => { resolveCopy = resolve; }));
    const ref = createRef<VisualEditorHandle>();
    const onChange = vi.fn();
    render(<VisualEditor ref={ref} noteId="note" initialInner="<p>BeforeAfter</p>" onChange={onChange} />);
    const surface = screen.getByRole("textbox", { name: "Not içeriği" });
    const current = (surface as HTMLElement & { editor: Editor }).editor;
    const copying = getDropHandler("note", "visual")!(["drop.svg"], { x: 20, y: 50 });
    act(() => { current.commands.insertContentAt(1, "Prefix"); });
    await act(async () => {
      resolveCopy({ relPath: "./assets/drop.svg", kind: "image", mime: "image/svg+xml" });
      await copying;
      ref.current?.flush();
    });
    expect(onChange).toHaveBeenLastCalledWith('<p>PrefixBefore</p>\n<img src="./assets/drop.svg">\n<p>After</p>');
  });

  it("keeps the SVG extension when pasting a file without MIME metadata", async () => {
    const save = vi.spyOn(ipc, "saveAssetBytes").mockResolvedValue({ relPath: "./assets/diagram.svg", kind: "image", mime: "image/svg+xml" });
    const view = render(<VisualEditor noteId="note" initialInner="<p></p>" onChange={vi.fn()} />);
    const file = new File(["<svg></svg>"], "diagram.svg");
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("<svg></svg>").buffer });
    await act(async () => {
      fireEvent.paste(screen.getByRole("textbox", { name: "Not içeriği" }), { clipboardData: { files: [file], getData: () => "" } });
    });
    expect(save).toHaveBeenCalledWith("note", "diagram.svg", expect.any(Uint8Array));
    expect(view.container.querySelector("img")).toHaveAttribute("src", "http://127.0.0.1:4123/note/assets/diagram.svg");
  });
  it("extends the editing surface and moves the cursor to the end only on a blank left click", () => {
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(null);
    const style = document.createElement("style");
    const styles = readFileSync("src/index.css", "utf8");
    style.textContent = styles.match(/\.htnote-code-editor,\s*\.htnote-visual-editor\s*\{[^}]+\}/)?.[0] ?? "";
    style.textContent += styles.match(/\.htnote-visual-(?:scroll|content)\s*\{[^}]+\}/g)?.join("\n") ?? "";
    style.textContent += styles.match(/\.htnote-visual-editor \.tiptap\s*\{[^}]+\}/)?.[0] ?? "";
    document.head.append(style);
    try {
      const { container } = render(<VisualEditor initialInner="<p>First</p><p>Last</p>" onChange={vi.fn()} />);
      const surface = screen.getByRole("textbox", { name: "Not içeriği" });
      const editor = (surface as HTMLElement & { editor: Editor }).editor;
      const last = surface.lastElementChild!;
      vi.spyOn(last, "getBoundingClientRect").mockReturnValue({ bottom: 120 } as DOMRect);
      expect(getComputedStyle(container.querySelector(".htnote-visual-editor")!)).toMatchObject({ height: "100%", overflow: "hidden" });
      expect(getComputedStyle(container.querySelector(".htnote-visual-scroll")!)).toMatchObject({ overflow: "auto", minHeight: "0px" });
      expect(getComputedStyle(surface).minHeight).toBe("100%");
      act(() => editor.commands.setTextSelection(1));
      fireEvent.mouseDown(surface, { button: 2, clientY: 300 });
      expect(editor.state.selection.from).toBe(1);
      fireEvent.mouseDown(surface, { button: 0, clientY: 300 });
      expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1);
      act(() => editor.commands.setTextSelection(1));
      fireEvent.mouseDown(surface.firstElementChild!, { button: 0, clientY: 20 });
      expect(editor.state.selection.from).toBe(1);
    } finally { style.remove(); }
  });
  it("drops three images and audio together at the drop point in order", async () => {
    const hitTest = vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue({ pos: 7, inside: 0 });
    const copy = vi.spyOn(ipc, "copyAsset").mockImplementation(async (_noteId, path) => ({
      relPath: `./assets/${fileName(path)}`, kind: kindFromPath(path), mime: "",
    }));
    const ref = createRef<VisualEditorHandle>();
    const onChange = vi.fn();
    const view = render(<VisualEditor ref={ref} noteId="note" initialInner="<p>BeforeAfter</p>" onChange={onChange} />);
    const drop = getDropHandler("note", "visual");
    expect(drop).toBeDefined();
    const paths = ["C:\\first.png", "C:\\second.jpg", "C:\\third.webp", "C:\\song.mp3"];
    await act(async () => {
      await drop!(paths, { x: 25, y: 50 });
      ref.current?.flush();
    });
    expect(hitTest).toHaveBeenCalledWith({ left: 25, top: 50 });
    expect(copy.mock.calls).toEqual(paths.map((path) => ["note", path]));
    expect(onChange).toHaveBeenLastCalledWith('<p>Before</p>\n<img src="./assets/first.png">\n<img src="./assets/second.jpg">\n<img src="./assets/third.webp">\n<audio src="./assets/song.mp3" controls=""></audio>\n<p>After</p>');
    view.unmount();
    expect(getDropHandler("note", "visual")).toBeUndefined();
  });

  it("pastes multiple media files as a single ordered batch", async () => {
    const save = vi.spyOn(ipc, "saveAssetBytes").mockImplementation(async () => ({
      relPath: `./assets/pasted-${save.mock.calls.length}.png`, kind: "image", mime: "image/png",
    }));
    const ref = createRef<VisualEditorHandle>();
    const onChange = vi.fn();
    render(<VisualEditor ref={ref} noteId="note" initialInner="<p></p>" onChange={onChange} />);
    const files = ["first.png", "second.png", "third.png"].map((name) => {
      const file = new File(["image"], name, { type: "image/png" });
      Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1, 2, 3]).buffer });
      return file;
    });
    await act(async () => {
      fireEvent.paste(screen.getByRole("textbox", { name: "Not içeriği" }), { clipboardData: { files, getData: () => "" } });
    });
    act(() => ref.current?.flush());
    expect(save).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith('<img src="./assets/pasted-1.png">\n<img src="./assets/pasted-2.png">\n<img src="./assets/pasted-3.png">');
  });

  it("round trips supported blocks and marks", () => {
    const fixture = '<h2>Başlık</h2><p><strong>Kalın</strong> <em>İtalik</em> <u>Altı çizili</u> <s>Çizili</s> <a href="https://example.com">Link</a></p><ul><li><p>Madde</p></li></ul><blockquote><p>Alıntı</p></blockquote><pre><code>Kod</code></pre><hr><table><tbody><tr><th><p>Başlık</p></th><td><p>Hücre</p></td></tr></tbody></table>';
    const editor = new Editor({ extensions: createVisualExtensions(""), content: fixture });
    editor.commands.setContent(fixture);
    expect(normalized(editor.getHTML())).toBe(normalized(fixture));
    editor.destroy();
  });

  it("debounces changes and flushes on unmount", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const view = render(<VisualEditor initialInner="<p>First</p>" onChange={onChange} />);
    screen.getByRole("textbox", { name: "Not içeriği" });
    act(() => { fireEvent.change(screen.getByRole("combobox"), { target: { value: "h2" } }); });
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledWith("<h2>First</h2>");
    act(() => { fireEvent.change(screen.getByRole("combobox"), { target: { value: "p" } }); });
    view.unmount();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("flushes a pending change before saving or switching modes", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const ref = createRef<VisualEditorHandle>();
    render(<VisualEditor ref={ref} initialInner="<p>First</p>" onChange={onChange} />);
    act(() => fireEvent.change(screen.getByRole("combobox"), { target: { value: "h2" } }));
    expect(onChange).not.toHaveBeenCalled();
    act(() => ref.current?.flush());
    expect(onChange).toHaveBeenCalledWith("<h2>First</h2>");
    act(() => vi.advanceTimersByTime(200));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not render when visual editing is unavailable", () => {
    render(<VisualEditor initialInner="<p>Test</p>" onChange={vi.fn()} visualAvailable={false} />);
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("does not report an unchanged document as dirty", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const view = render(<VisualEditor initialInner={'<p class="x" data-y="1">A</p><canvas></canvas><script>run()</script>'} onChange={onChange} />);
    act(() => vi.advanceTimersByTime(300));
    view.unmount();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves raw canvas and script after a rich block edit", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const view = render(<VisualEditor initialInner={'<p class="x" data-y="1">A</p><canvas id="c"></canvas><script>run()</script>'} onChange={onChange} />);
    act(() => { fireEvent.change(screen.getByRole("combobox"), { target: { value: "h2" } }); });
    act(() => vi.advanceTimersByTime(150));
    const result = onChange.mock.lastCall?.[0] as string;
    expect(result).toContain('<canvas id="c"></canvas>\n<script>run()</script>');
    expect(result).toContain('data-y="1"');
    expect(result).not.toContain("htnote-raw");
    view.unmount();
  });

  it("reflects contentWidth setting as data-content-width attribute", () => {
    useSettingsStore.setState({ settings: { contentWidth: "narrow" } as Settings });
    const { container, rerender } = render(<VisualEditor initialInner="<p>Test</p>" onChange={vi.fn()} />);
    const editorEl = container.querySelector(".htnote-visual-editor");
    expect(editorEl).toHaveAttribute("data-content-width", "narrow");

    useSettingsStore.setState({ settings: { contentWidth: "full" } as Settings });
    rerender(<VisualEditor initialInner="<p>Test</p>" onChange={vi.fn()} />);
    expect(editorEl).toHaveAttribute("data-content-width", "full");
  });
});
