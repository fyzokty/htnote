import { createRef } from "react";
import { Editor } from "@tiptap/core";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VisualEditor } from "./VisualEditor";
import type { VisualEditorHandle } from "./VisualEditor";
import { serializeTextBox } from "./textBox";
import { widgetMotionKey } from "./widgets/widgetMotion";
import { useEditSession } from "./useEditSession";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";

describe("TextBoxView", () => {
  it("marks the actual edit session dirty and flushes both fields into its note draft", () => {
    vi.useFakeTimers();
    resetTabsStoreForTests();
    const initial = serializeTextBox({ title: "", content: "", html: null }) + "<p></p>";
    useTabsStore.getState().openNote("widget", { editBase: { html: `<main id="htnote-content">${initial}</main>`, css: null, js: null, contentHash: "base" } });
    const { result, unmount: unmountHook } = renderHook(() => useEditSession("widget"));
    const { unmount } = render(<VisualEditor ref={result.current.visualRef} initialInner={initial} onChange={result.current.onVisualChange} />);
    try {
      expect(useTabsStore.getState().isDirty("widget")).toBe(false);
      fireEvent.change(screen.getByTestId("textbox-title"), { target: { value: "Saved title" } });
      fireEvent.change(screen.getByTestId("textbox-content"), { target: { value: "Saved\n<&" } });
      fireEvent.click(screen.getByRole("button", { name: "Widget arka planı" }));
      fireEvent.click(screen.getByRole("button", { name: "Nane" }));
      act(() => { vi.advanceTimersByTime(150); });
      expect(useTabsStore.getState().isDirty("widget")).toBe(true);
      expect(useTabsStore.getState().tabs[0].doc.draft?.html).toContain("Saved title");
      expect(useTabsStore.getState().tabs[0].doc.draft?.html).toContain("Saved\n&lt;&amp;");
      expect(useTabsStore.getState().tabs[0].doc.draft?.html).toContain('data-htnote-bg="mint"');
      expect(useTabsStore.getState().tabs[0].doc.draft?.html).toContain('id="htnote-appearance"');
    } finally { unmount(); unmountHook(); resetTabsStoreForTests(); vi.useRealTimers(); }
  });
  it("updates attributes through real fields, reports changes, preserves app shortcuts and exits the box", () => {
    vi.useFakeTimers();
    const ref = createRef<VisualEditorHandle>();
    const changed = vi.fn();
    const { unmount } = render(<VisualEditor ref={ref} initialInner={serializeTextBox({ title: "", content: "", html: null })} onChange={changed} />);
    try {
      const surface = screen.getByRole("textbox", { name: "Not içeriği" }) as HTMLElement & { editor: Editor };
      const editor = surface.editor;
      expect(widgetMotionKey.getState(editor.state)!.find()).toHaveLength(0);
      const title = screen.getByTestId("textbox-title");
      const content = screen.getByTestId("textbox-content") as HTMLTextAreaElement;
      fireEvent.change(title, { target: { value: "New title" } });
      expect(editor.state.doc.firstChild?.attrs.title).toBe("New title");
      fireEvent.keyDown(title, { key: "Enter" });
      expect(content).toHaveFocus();
      fireEvent.change(content, { target: { value: "a\n<&" } });
      expect(editor.state.doc.firstChild?.attrs.content).toBe("a\n<&");
      act(() => { ref.current?.flush(); });
      expect(changed).toHaveBeenCalledWith(expect.stringContaining("a\n&lt;&amp;"));
      const bold = new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true });
      content.dispatchEvent(bold);
      expect(editor.isActive("bold")).toBe(false);
      const save = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
      const listener = vi.fn();
      window.addEventListener("keydown", listener, { once: true });
      content.dispatchEvent(save);
      expect(listener).toHaveBeenCalled();
      act(() => { fireEvent.keyDown(content, { key: "z", ctrlKey: true }); });
      expect(editor.state.doc.firstChild?.attrs.content).toBe("");
      act(() => { fireEvent.keyDown(content, { key: "z", ctrlKey: true, shiftKey: true }); });
      expect(editor.state.doc.firstChild?.attrs.content).toBe("a\n<&");
      content.setSelectionRange(content.value.length, content.value.length);
      fireEvent.keyDown(content, { key: "ArrowDown" });
      expect(editor.view.dom).toHaveFocus();
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      fireEvent.click(screen.getByTestId("insert-widget"));
      fireEvent.keyDown(screen.getByTestId("insert-textbox"), { key: "ArrowDown" });
      expect(screen.getByTestId("insert-checklist")).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId("insert-checklist"), { key: "ArrowUp" });
      expect(screen.getByTestId("insert-textbox")).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId("insert-textbox"), { key: "Enter" });
      expect(editor.state.doc.content.content.filter((node) => node.type.name === "textBox")).toHaveLength(2);
      expect(widgetMotionKey.getState(editor.state)!.find()).toHaveLength(1);
      fireEvent.keyDown(screen.getAllByRole("button", { name: "Metin kutusunu seç" })[0], { key: "Enter" });
      expect(editor.state.selection.from).toBe(0);
      expect(editor.state.selection.to).toBe(editor.state.doc.firstChild!.nodeSize);
    } finally { unmount(); vi.useRealTimers(); }
  });
});
