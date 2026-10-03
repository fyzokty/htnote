import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CodeEditor } from "@/features/editor/CodeEditor";
import { fileName, getDropHandler, kindFromPath } from "@/features/editor/fileDrop";
import { ipc } from "@/lib/ipc";

describe("CodeEditor file drop", () => {
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
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByRole("tabpanel", { name: "HTML" }).id).toBe(tabs[0].getAttribute("aria-controls"));
    fireEvent.click(tabs[1]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    expect(screen.getByRole("tabpanel", { name: "CSS" })).toHaveTextContent("body {}");
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
    expect(screen.getByRole("tabpanel", { name: "JS" })).toHaveTextContent("const x = 1;");
  });

  it("preserves edits and undo history when switching tabs", () => {
    const onChange = vi.fn();
    const { container } = render(<CodeEditor html="<p>HTML</p>" css="body {}" js="" onChange={onChange} />);
    const editor = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;
    act(() => editor.dispatch({ changes: { from: editor.state.doc.length, insert: "<!--changed-->" } }));
    expect(onChange).toHaveBeenLastCalledWith({ html: "<p>HTML</p><!--changed-->" });
    fireEvent.click(screen.getByRole("tab", { name: "CSS" }));
    expect(editor.state.doc.toString()).toBe("body {}");
    fireEvent.click(screen.getByRole("tab", { name: "HTML" }));
    expect(editor.state.doc.toString()).toBe("<p>HTML</p><!--changed-->");
    fireEvent.keyDown(editor.contentDOM, { key: "z", code: "KeyZ", ctrlKey: true });
    expect(editor.state.doc.toString()).toBe("<p>HTML</p>");
  });
});
