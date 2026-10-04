import { createRef } from "react";
import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { enterEdit, createDocState } from "@/features/editor/docState";
import { EditSessionHeader, EditSessionStatus } from "./EditSessionHeader";
import { NoteEditor } from "@/features/editor/NoteEditor";
import type { VisualEditorHandle } from "@/features/editor/VisualEditor";
import type { useEditSession } from "@/features/editor/useEditSession";
import type { SplitView } from "@/features/editor/SplitView";
import { formatShortcut } from "@/lib/shortcuts/registry";

vi.mock("@/features/editor/VisualEditor", () => ({ VisualEditor: () => <div>Visual content</div> }));
vi.mock("@/features/editor/CodeEditor", () => ({ CodeEditor: () => <div>Code content</div> }));
vi.mock("@/features/editor/LivePreview", () => ({ LivePreview: () => <div>Preview content</div> }));
vi.mock("@/features/editor/SplitView", () => ({ SplitView: ({ editor, children }: ComponentProps<typeof SplitView>) => <div>{typeof editor === "function" ? editor(null) : editor}{children}</div> }));

function session() {
  return {
    visualRef: createRef<VisualEditorHandle>(),
    save: vi.fn(), cancel: vi.fn(), switchMode: vi.fn(), onVisualChange: vi.fn(), onCodeChange: vi.fn(),
  } as unknown as ReturnType<typeof useEditSession>;
}

function Editing({ noteId, doc, session: actions }: ComponentProps<typeof NoteEditor>) {
  return <><div data-testid="note-header"><EditSessionStatus doc={doc} /><EditSessionHeader doc={doc} session={actions} /></div><NoteEditor noteId={noteId} doc={doc} session={actions} /></>;
}

describe("NoteEditor", () => {
  it("connects toolbar controls and mode selector", () => {
    const actions = session();
    const doc = enterEdit(createDocState(), { html: '<main id="htnote-content"><p>A</p></main>', css: null, js: null, contentHash: "one" });
    render(<Editing noteId="a" doc={doc} session={actions} />);
    expect(screen.getByText("Visual content")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(actions.save).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("note-header")).toContainElement(screen.getByTestId("save-note"));
    expect(screen.getByTestId("save-note").querySelector("kbd")).toBeNull();
    expect(document.querySelector(".htnote-session-bar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "İptal" }));
    expect(actions.cancel).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Kod" }));
    expect(actions.switchMode).toHaveBeenCalledWith("code");
    expect(screen.getByRole("button", { name: "Görsel" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Kod" })).toHaveAttribute("aria-pressed", "false");
  });

  it("disables visual mode with a hover tooltip when the content region is missing", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 28, height: 28, left: 0, top: 0, bottom: 28 } as DOMRect);
    const doc = enterEdit(createDocState(), { html: "<html></html>", css: null, js: null, contentHash: "one" }, "visual", false);
    render(<Editing noteId="a" doc={doc} session={session()} />);
    expect(screen.getByRole("button", { name: "Görsel" })).toBeDisabled();
    vi.useFakeTimers();
    try {
      fireEvent.mouseEnter(screen.getByRole("button", { name: "Görsel" }).parentElement!);
      act(() => vi.advanceTimersByTime(400));
      expect(screen.getByRole("tooltip")).toHaveTextContent("main#htnote-content");
    } finally { vi.useRealTimers(); }
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Code content")).toBeInTheDocument();
  });

  it("switches both modes with the segmented control keyboard navigation", () => {
    const actions = session();
    const doc = enterEdit(createDocState(), { html: '<main id="htnote-content"><p>A</p></main>', css: null, js: null, contentHash: "one" });
    const { rerender } = render(<Editing noteId="a" doc={doc} session={actions} />);
    const group = screen.getByRole("group", { name: "Düzenleme modu" });
    const visual = within(group).getByRole("button", { name: "Görsel" });
    const code = within(group).getByRole("button", { name: "Kod" });
    fireEvent.keyDown(visual, { key: "ArrowRight" });
    expect(code).toHaveFocus();
    expect(actions.switchMode).toHaveBeenLastCalledWith("code");
    rerender(<Editing noteId="a" doc={{ ...doc, mode: "code" }} session={actions} />);
    expect(code).toHaveAttribute("aria-pressed", "true");
    expect(visual).toHaveAttribute("aria-pressed", "false");
    fireEvent.keyDown(code, { key: "ArrowLeft" });
    expect(visual).toHaveFocus();
    expect(actions.switchMode).toHaveBeenLastCalledWith("visual");
  });

  it("disables session actions and announces saving, then enables them again", () => {
    const actions = session();
    const doc = enterEdit(createDocState(), { html: '<main id="htnote-content"></main>', css: null, js: null, contentHash: "one" });
    const { rerender } = render(<Editing noteId="a" doc={{ ...doc, saving: true }} session={actions} />);
    const save = screen.getByTestId("save-note");
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("aria-busy", "true");
    expect(save).toHaveTextContent("Kaydediliyor…");
    expect(save.querySelector(".htnote-editor-spinner")).not.toBeNull();
    const cancel = screen.getByRole("button", { name: "İptal" });
    expect(cancel).toBeDisabled();
    fireEvent.click(save);
    fireEvent.click(cancel);
    expect(actions.save).not.toHaveBeenCalled();
    expect(actions.cancel).not.toHaveBeenCalled();
    rerender(<Editing noteId="a" doc={doc} session={actions} />);
    expect(save).toBeEnabled();
    expect(cancel).toBeEnabled();
    expect(save).toHaveAttribute("aria-busy", "false");
    vi.spyOn(save.parentElement!, "getBoundingClientRect").mockReturnValue({ width: 28, height: 28, left: 0, top: 0, bottom: 28 } as DOMRect);
    vi.spyOn(save, "matches").mockImplementation((selector) => selector === ":focus-visible");
    act(() => save.focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent(formatShortcut("save"));
  });

  it("shows the unsaved status only while dirty", () => {
    const doc = enterEdit(createDocState(), { html: '<main id="htnote-content"></main>', css: null, js: null, contentHash: "one" });
    const actions = session();
    const { rerender } = render(<Editing noteId="a" doc={{ ...doc, dirty: true }} session={actions} />);
    expect(screen.getByRole("status")).toHaveTextContent("Kaydedilmedi");
    rerender(<Editing noteId="a" doc={doc} session={actions} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps mode wrappers without duplicating the viewer entry animation", () => {
    const actions = session();
    const doc = enterEdit(createDocState(), { html: '<main id="htnote-content"><p>A</p></main>', css: null, js: null, contentHash: "one" });
    const { rerender, container } = render(<Editing noteId="a" doc={doc} session={actions} />);
    const visualWrapper = container.querySelector('[data-mode="visual"]');
    expect(visualWrapper).toBeInTheDocument();
    expect(visualWrapper).not.toHaveClass("htnote-mode-transition");

    rerender(<Editing noteId="a" doc={{ ...doc, mode: "code" }} session={actions} />);
    const codeWrapper = container.querySelector('[data-mode="code"]');
    expect(codeWrapper).toBeInTheDocument();
    expect(codeWrapper).not.toHaveClass("htnote-mode-transition");
  });
});
