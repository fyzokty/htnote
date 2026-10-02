import { EditorView } from "@codemirror/view";
import { act, render } from "@testing-library/react";
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
