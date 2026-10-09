import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VisualEditor } from "./VisualEditor";
import { classifyTopLevel } from "./blockClassifier";
import { readChecklist, serializeChecklist } from "./checklist";
import { readCopyFields, serializeCopyFields } from "./copyFields";
import { serializeVisualHtml } from "./visualPipeline";

const widgets = [
  { kind: "copyfields", field: "copyfields-value", empty: serializeCopyFields({ title: "", fields: [], html: null }),
    rows: (source: string) => readCopyFields(source)!.fields.length },
  { kind: "checklist", field: "checklist-item", empty: serializeChecklist({ title: "", items: [], html: null }),
    rows: (source: string) => readChecklist(source)!.items.length },
];

describe("widget empty rows", () => {
  it.each(widgets)("keeps $kind row removal immediate, undoable and serializable", async ({ kind, field, empty, rows }) => {
    const { unmount } = render(<VisualEditor initialInner={empty} onChange={vi.fn()} />);
    const editor = (screen.getByRole("textbox", { name: "Not içeriği" }) as HTMLElement & { editor: Editor }).editor;
    const fields = () => screen.getAllByTestId(field) as HTMLTextAreaElement[];
    try {
      await act(async () => { fireEvent.change(fields()[0], { target: { value: "Kept" } }); });
      await act(async () => { fireEvent.keyDown(fields()[0], { key: "Enter" }); });
      await act(async () => { fireEvent.change(fields()[1], { target: { value: "Removed" } }); });
      const saved = serializeVisualHtml(editor.getHTML());
      act(() => { editor.view.dispatch(closeHistory(editor.state.tr)); });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: kind === "checklist" ? "Madde 2 sil" : "Alan 2 sil" })); });
      expect(fields()).toHaveLength(1);
      expect(screen.getAllByTestId(kind === "copyfields" ? "copyfields-label" : field)[0]).toHaveFocus();
      const widget = classifyTopLevel(serializeVisualHtml(editor.getHTML())).find((block) => block.kind === kind)!;
      expect(rows(widget.html)).toBe(1);
      await act(async () => { editor.commands.undo(); });
      expect(fields()).toHaveLength(2);
      expect(fields()[1].value).toBe("Removed");
      expect(serializeVisualHtml(editor.getHTML())).toBe(saved);
      await act(async () => { editor.commands.redo(); });
      expect(fields()).toHaveLength(1);
    } finally { unmount(); }
  });
  it.each(widgets)("keeps $kind writing rows visible and reopens saved empty lists with one usable row", async ({ kind, field, empty, rows }) => {
    const original = empty.replace(`data-htnote-widget="${kind}"`, `data-htnote-widget='${kind}'`);
    const open = (source: string) => render(<VisualEditor initialInner={source} onChange={vi.fn()} />);
    const fields = () => screen.getAllByTestId(field) as HTMLTextAreaElement[];
    const save = () => {
      const editor = (screen.getByRole("textbox", { name: "Not içeriği" }) as HTMLElement & { editor: Editor }).editor;
      return serializeVisualHtml(editor.getHTML());
    };
    const widget = (source: string) => classifyTopLevel(source).find((block) => block.kind === kind)!.html;
    let view = open(original);
    try {
      expect(fields()).toHaveLength(1);
      expect(fields()[0].value).toBe("");
      expect(widget(save())).toBe(original);
      await act(async () => { fireEvent.change(fields()[0], { target: { value: "Saved text" } }); });
      await act(async () => { fireEvent.keyDown(fields()[0], { key: "Enter" }); });
      expect(fields()).toHaveLength(2);
      expect(screen.getAllByTestId(kind === "copyfields" ? "copyfields-label" : field)[1]).toHaveFocus();
      const saved = save();
      expect(rows(widget(saved))).toBe(1);
      expect(fields()).toHaveLength(2);
      view.unmount(); view = open(saved);
      expect(fields()).toHaveLength(1);
      expect(fields()[0].value).toBe("Saved text");
      await act(async () => { fireEvent.change(fields()[0], { target: { value: " " } }); });
      const cleared = save();
      expect(rows(widget(cleared))).toBe(0);
      expect(fields()[0].value).toBe(" ");
      view.unmount(); view = open(cleared);
      expect(fields()).toHaveLength(1);
      expect(fields()[0].value).toBe("");
      await act(async () => { fireEvent.change(fields()[0], { target: { value: "New text" } }); });
      expect(rows(widget(save()))).toBe(1);
    } finally { view.unmount(); }
  });
});
