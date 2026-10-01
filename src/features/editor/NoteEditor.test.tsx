import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { enterEdit, createDocState } from "@/features/editor/docState";
import { NoteEditor } from "@/features/editor/NoteEditor";
import type { VisualEditorHandle } from "@/features/editor/VisualEditor";
import type { useEditSession } from "@/features/editor/useEditSession";

vi.mock("@/features/editor/VisualEditor", () => ({ VisualEditor: () => <div>Visual content</div> }));
vi.mock("@/features/editor/CodeEditor", () => ({ CodeEditor: () => <div>Code content</div> }));
vi.mock("@/features/editor/LivePreview", () => ({ LivePreview: () => <div>Preview content</div> }));
vi.mock("@/features/editor/SplitView", () => ({ SplitView: ({ editor, children }: { editor: React.ReactNode; children: React.ReactNode }) => <div>{editor}{children}</div> }));

function session() {
  return {
    visualRef: createRef<VisualEditorHandle>(),
    save: vi.fn(), cancel: vi.fn(), switchMode: vi.fn(), onVisualChange: vi.fn(), onCodeChange: vi.fn(),
  } as unknown as ReturnType<typeof useEditSession>;
}

describe("NoteEditor", () => {
  it("connects toolbar controls and mode selector", () => {
    const actions = session();
    const doc = enterEdit(createDocState(), { html: '<main id="htnote-content"><p>A</p></main>', css: null, js: null, contentHash: "one" });
    render(<NoteEditor noteId="a" doc={doc} session={actions} />);
    expect(screen.getByText("Visual content")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(actions.save).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "İptal" }));
    expect(actions.cancel).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Kod" }));
    expect(actions.switchMode).toHaveBeenCalledWith("code");
  });

  it("disables visual mode with a reason when the content region is missing", () => {
    const doc = enterEdit(createDocState(), { html: "<html></html>", css: null, js: null, contentHash: "one" }, "visual", false);
    render(<NoteEditor noteId="a" doc={doc} session={session()} />);
    expect(screen.getByRole("button", { name: "Görsel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Görsel" })).toHaveAttribute("title", expect.stringContaining("main#htnote-content"));
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Code content")).toBeInTheDocument();
  });
});
