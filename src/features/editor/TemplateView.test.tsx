import { createRef } from "react";
import { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VisualEditor, type VisualEditorHandle } from "./VisualEditor";
import { serializeTemplate } from "./template";
import { useEditSession } from "./useEditSession";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";

describe("TemplateView", () => {
  it("marks the edit session dirty and flushes title, raw source and background to the draft", async () => {
    resetTabsStoreForTests();
    const initial = serializeTemplate({ title: "", content: "", html: null });
    useTabsStore.getState().openNote("template", { editBase: { html: `<main id="htnote-content">${initial}</main>`, css: null, js: null, contentHash: "base" } });
    const { result, unmount: unmountHook } = renderHook(() => useEditSession("template"));
    const { unmount } = render(<VisualEditor ref={result.current.visualRef} initialInner={initial} onChange={result.current.onVisualChange} />);
    try {
      expect(useTabsStore.getState().isDirty("template")).toBe(false);
      fireEvent.change(screen.getByTestId("template-title"), { target: { value: "Customer response" } });
      fireEvent.change(screen.getByTestId("template-content"), { target: { value: "Sayın {{Ad|Ahmet}}, {{AD}}\n<&>" } });
      await waitFor(() => expect(screen.getAllByText("Ad", { exact: true })).toHaveLength(1));
      fireEvent.click(screen.getByRole("button", { name: "Widget arka planı" }));
      fireEvent.click(screen.getByRole("button", { name: "Nane" }));
      await waitFor(() => expect(useTabsStore.getState().tabs[0].doc.draft?.html).toContain('data-htnote-bg="mint"'));
      expect(useTabsStore.getState().isDirty("template")).toBe(true);
      const draft = useTabsStore.getState().tabs[0].doc.draft?.html;
      expect(draft).toContain("Customer response");
      expect(draft).toContain("Sayın {{Ad|Ahmet}}, {{AD}}\n&lt;&amp;&gt;");
      expect(draft).toContain('data-htnote-bg="mint"');
      expect(draft).not.toContain("htnote-template-node");
    } finally { unmount(); unmountHook(); resetTabsStoreForTests(); }
  });

  it("handles menu insertion, focus, node history, app shortcuts and both boundaries", async () => {
    const ref = createRef<VisualEditorHandle>();
    const { unmount } = render(<VisualEditor ref={ref} initialInner="<p></p>" onChange={vi.fn()} />);
    try {
      fireEvent.click(screen.getByTestId("insert-widget"));
      fireEvent.keyDown(screen.getByTestId("insert-template"), { key: "Enter" });
      const editor = (screen.getByRole("textbox", { name: "Not içeriği" }) as HTMLElement & { editor: Editor }).editor;
      const title = await screen.findByTestId("template-title"), source = screen.getByTestId("template-content") as HTMLTextAreaElement;
      expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
      editor.view.dispatch(closeHistory(editor.state.tr));
      fireEvent.keyDown(title, { key: "Enter" }); expect(source).toHaveFocus();
      fireEvent.change(source, { target: { value: "{{Ad}}" } });
      expect(editor.state.doc.firstChild?.attrs.content).toBe("{{Ad}}");
      act(() => { fireEvent.keyDown(source, { key: "z", ctrlKey: true }); });
      expect(editor.state.doc.firstChild?.attrs.content).toBe("");
      act(() => { fireEvent.keyDown(source, { key: "y", ctrlKey: true }); });
      expect(editor.state.doc.firstChild?.attrs.content).toBe("{{Ad}}");
      const save = vi.fn(); window.addEventListener("keydown", save, { once: true });
      fireEvent.keyDown(source, { key: "s", ctrlKey: true }); expect(save).toHaveBeenCalled();
      fireEvent.keyDown(source, { key: "b", ctrlKey: true }); expect(editor.isActive("bold")).toBe(false);
      source.setSelectionRange(source.value.length, source.value.length);
      fireEvent.keyDown(source, { key: "ArrowDown" });
      expect(editor.view.dom).toHaveFocus(); expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      source.focus(); source.setSelectionRange(0, 0);
      fireEvent.keyDown(source, { key: "ArrowUp" });
      expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
      fireEvent.keyDown(screen.getByRole("button", { name: "Şablon doldurucuyu seç" }), { key: "Enter" });
      expect(editor.state.selection.$from.nodeAfter?.type.name).toBe("template");
      expect(editor.state.selection.to - editor.state.selection.from).toBe(1);
    } finally { unmount(); }
  });
});
