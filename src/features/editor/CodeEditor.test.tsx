/// <reference types="node" />
import { EditorView } from "@codemirror/view";
import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CodeEditor } from "@/features/editor/CodeEditor";
import { fileName, getDropHandler, kindFromPath, updateDropPreview } from "@/features/editor/fileDrop";
import { formatShortcut } from "@/lib/shortcuts/registry";
import { ipc } from "@/lib/ipc";
import type { Settings } from "@/lib/types";
import { useSettingsStore } from "@/stores/settingsStore";
const appStyles = readFileSync("src/index.css", "utf8");

describe("CodeEditor formatting and layout", () => {
  it("formats HTML from the toolbar and keyboard, and disables formatting on CSS/JS", () => {
    const onChange = vi.fn();
    const { container } = render(<CodeEditor html="<div><p>A</p><p>B</p></div>" css="p {}" js="run()" onChange={onChange} />);
    const editor = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;
    const button = screen.getByRole("button", { name: "Belgeyi biçimlendir" });
    vi.spyOn(button.parentElement!, "getBoundingClientRect").mockReturnValue({ width: 28, height: 28, left: 0, top: 0, bottom: 28 } as DOMRect);
    vi.spyOn(button, "matches").mockImplementation((selector) => selector === ":focus-visible");
    act(() => button.focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent(formatShortcut("formatDocument"));
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ html: "<div>\n  <p>A</p>\n  <p>B</p>\n</div>" });
    fireEvent.keyDown(editor.contentDOM, { key: "z", code: "KeyZ", ctrlKey: true });
    expect(editor.state.doc.toString()).toBe("<div><p>A</p><p>B</p></div>");
    fireEvent.keyDown(editor.contentDOM, { key: "f", code: "KeyF", keyCode: 70, shiftKey: true, altKey: true });
    expect(editor.state.doc.toString()).toBe("<div>\n  <p>A</p>\n  <p>B</p>\n</div>");
    for (const name of ["style.css", "script.js"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      expect(button).toBeDisabled();
      const before = editor.state.doc.toString();
      fireEvent.keyDown(editor.contentDOM, { key: "F", code: "KeyF", shiftKey: true, altKey: true });
      expect(editor.state.doc.toString()).toBe(before);
    }
  });

  it("fills the host, scrolls inside CodeMirror, and enables wrapping and gutters", () => {
    const style = document.createElement("style");
    style.textContent = appStyles.match(/\.htnote-code-editor,\s*\.htnote-visual-editor\s*\{[^}]+\}/)?.[0] ?? "";
    style.textContent += appStyles.match(/\.htnote-code-host(?:[^{}]*)\{[^}]+\}/g)?.join("\n") ?? "";
    document.head.append(style);
    try {
      const { container } = render(<CodeEditor html="<div><p>A</p></div>" css="" js="" onChange={vi.fn()} />);
      const section = container.querySelector(".htnote-code-editor")!;
      const host = container.querySelector(".htnote-code-host")!;
      const editor = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;
      expect(getComputedStyle(section)).toMatchObject({ height: "100%", minHeight: "0px", display: "flex", overflow: "hidden" });
      expect(getComputedStyle(host)).toMatchObject({ minHeight: "0px", overflow: "hidden" });
      expect(getComputedStyle(editor.dom).height).toBe("100%");
      expect(getComputedStyle(editor.scrollDOM)).toMatchObject({ overflow: "auto", fontSize: "13px", lineHeight: "1.6" });
      expect(editor.lineWrapping).toBe(true);
      expect(container.querySelector(".cm-lineNumbers")).not.toBeNull();
      expect(container.querySelector(".cm-foldGutter")).not.toBeNull();
      expect(container.querySelector(".cm-activeLine")).not.toBeNull();
    } finally { style.remove(); }
  });
});

describe("CodeEditor file drop", () => {
  it("registers the native preview only on HTML and clears it on tab change and unmount", () => {
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(3);
    vi.spyOn(EditorView.prototype, "coordsAtPos").mockReturnValue({ left: 30, right: 30, top: 40, bottom: 60 });
    const view = render(<CodeEditor noteId="preview" html="<p>Text</p>" css="" js="" onChange={vi.fn()} />);
    act(() => updateDropPreview("preview", { x: 30, y: 50 }, "code"));
    expect(document.querySelector(".htnote-drop-cursor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "style.css" }));
    expect(document.querySelector(".htnote-drop-cursor")).not.toBeInTheDocument();
    expect(getDropHandler("preview", "code")).toBeUndefined();
    act(() => updateDropPreview("preview", { x: 30, y: 50 }, "code"));
    expect(document.querySelector(".htnote-drop-cursor")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "index.html" }));
    act(() => updateDropPreview("preview", { x: 30, y: 50 }, "code"));
    expect(document.querySelector(".htnote-drop-cursor")).toBeInTheDocument();
    view.unmount();
    expect(document.querySelector(".htnote-drop-cursor")).not.toBeInTheDocument();
  });

  it("inserts every tag in order at the drop point with one change", async () => {
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(9);
    const copy = vi.spyOn(ipc, "copyAsset").mockImplementation(async (_noteId, path) => ({
      relPath: `./assets/${fileName(path)}`, kind: kindFromPath(path), mime: "",
    }));
    const onChange = vi.fn();
    const view = render(<CodeEditor noteId="note" html="<p>BeforeAfter</p>" css="" js="" onChange={onChange} />);
    const paths = ["C:\\first.png", "C:\\second.jpg", "C:\\third.webp", "C:\\song.mp3", "C:\\movie.mp4", "C:\\doc.pdf"];
    const tags = '<img src="./assets/first.png" alt="first.png"><img src="./assets/second.jpg" alt="second.jpg"><img src="./assets/third.webp" alt="third.webp"><audio src="./assets/song.mp3" controls></audio><video src="./assets/movie.mp4" controls></video><a href="./assets/doc.pdf">doc.pdf</a>';
    const drop = getDropHandler("note", "code");
    expect(drop).toBeDefined();
    await act(async () => { await drop!(paths, { x: 25, y: 50 }); });
    expect(copy.mock.calls).toEqual(paths.map((path) => ["note", path]));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ html: `<p>Before${tags}After</p>` });
    const host = view.container.querySelector(".cm-editor") as HTMLElement;
    const editor = EditorView.findFromDOM(host)!;
    expect(editor.state.selection.main.head).toBe(9 + tags.length);
    view.unmount();
    expect(getDropHandler("note", "code")).toBeUndefined();
  });
});

describe("CodeEditor tabs", () => {
  it("selects tabs with a single keyboard stop and labels the active panel", () => {
    render(<CodeEditor html="<p>HTML</p>" css="body {}" js="const x = 1;" onChange={vi.fn()} />);
    const tablist = screen.getByRole("tablist", { name: "Kod sekmeleri" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["index.html", "style.css", "script.js"]);
    expect(tabs.map((tab) => tab.querySelector(".htnote-code-dot")?.className)).toEqual(["htnote-code-dot htnote-code-dot-html", "htnote-code-dot htnote-code-dot-css", "htnote-code-dot htnote-code-dot-js"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByRole("tabpanel", { name: "index.html" }).id).toBe(tabs[0].getAttribute("aria-controls"));
    fireEvent.click(tabs[1]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    expect(screen.getByRole("tabpanel", { name: "style.css" })).toHaveTextContent("body {}");
  });

  it("navigates with arrows, wraps, and supports Home and End without moving focus into CodeMirror", () => {
    render(<CodeEditor html="<p>HTML</p>" css="body {}" js="const x = 1;" onChange={vi.fn()} />);
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    for (const [from, key, to] of [[0, "ArrowRight", 1], [1, "ArrowRight", 2], [2, "ArrowRight", 0], [0, "ArrowLeft", 2], [2, "Home", 0], [0, "End", 2]] as const) {
      fireEvent.keyDown(tabs[from], { key });
      expect(tabs[to]).toHaveFocus();
      expect(tabs[to]).toHaveAttribute("aria-selected", "true");
      expect(tabs.filter((tab) => tab.getAttribute("aria-selected") === "true")).toHaveLength(1);
    }
    expect(screen.getByRole("tabpanel", { name: "script.js" })).toHaveTextContent("const x = 1;");
  });

  it("preserves edits and undo history when switching tabs", () => {
    const onChange = vi.fn();
    const { container } = render(<CodeEditor html="<p>HTML</p>" css="body {}" js="" onChange={onChange} />);
    const editor = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;
    act(() => editor.dispatch({ changes: { from: editor.state.doc.length, insert: "<!--changed-->" } }));
    expect(onChange).toHaveBeenLastCalledWith({ html: "<p>HTML</p><!--changed-->" });
    fireEvent.click(screen.getByRole("tab", { name: "style.css" }));
    expect(editor.state.doc.toString()).toBe("body {}");
    fireEvent.click(screen.getByRole("tab", { name: "index.html" }));
    expect(editor.state.doc.toString()).toBe("<p>HTML</p><!--changed-->");
    fireEvent.keyDown(editor.contentDOM, { key: "z", code: "KeyZ", ctrlKey: true });
    expect(editor.state.doc.toString()).toBe("<p>HTML</p>");
  });

  it("reflects contentWidth setting as data-content-width attribute", () => {
    useSettingsStore.setState({ settings: { contentWidth: "narrow" } as Settings });
    const { container, rerender } = render(<CodeEditor html="<p>HTML</p>" css="" js="" onChange={vi.fn()} />);
    const editorEl = container.querySelector(".htnote-code-editor");
    expect(editorEl).toHaveAttribute("data-content-width", "narrow");

    useSettingsStore.setState({ settings: { contentWidth: "wide" } as Settings });
    rerender(<CodeEditor html="<p>HTML</p>" css="" js="" onChange={vi.fn()} />);
    expect(editorEl).toHaveAttribute("data-content-width", "wide");
  });
});
