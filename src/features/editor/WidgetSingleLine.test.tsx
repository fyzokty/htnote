import type { Editor } from "@tiptap/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VisualEditor } from "./VisualEditor";
import { serializeChecklist } from "./checklist";
import { serializeCopyFields } from "./copyFields";
import { classifyTopLevel } from "./blockClassifier";
import { serializeVisualHtml } from "./visualPipeline";

const widgets = [
  { kind: "checklist", field: "checklist-item", enterField: "checklist-item", count: 2,
    source: serializeChecklist({ title: "Saved", items: [{ text: "a <&> b", checked: true }], html: null }) },
  ...["label", "value"].map((column) => ({ kind: "copyfields", field: `copyfields-${column}`, enterField: column === "label" ? "copyfields-value" : "copyfields-label", count: column === "label" ? 1 : 2,
    source: serializeCopyFields({ title: "Saved", fields: [{ label: "a <&> b", value: "a <&> b" }], html: null }) })),
];

describe("single-line widget fields", () => {
  it.each(widgets)("keeps $field free of line breaks and preserves its saved HTML", async ({ kind, field, enterField, count, source }) => {
    const view = render(<VisualEditor initialInner={source} onChange={vi.fn()} />);
    const editor = (screen.getByRole("textbox", { name: "Not içeriği" }) as HTMLElement & { editor: Editor }).editor;
    const saved = () => classifyTopLevel(serializeVisualHtml(editor.getHTML())).find((block) => block.kind === kind)!.html;
    const input = screen.getByTestId(field) as HTMLTextAreaElement;
    try {
      expect(saved()).toBe(source);
      for (const modifier of [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
        expect(fireEvent.keyDown(input, { key: "Enter", ...modifier })).toBe(false);
        expect(screen.getAllByTestId(field)).toHaveLength(1);
        expect(input.value).toBe("a <&> b");
      }
      // IME onayı widget satırı eklemez ve yerel olayı engellemez.
      expect(fireEvent.keyDown(input, { key: "Enter", isComposing: true })).toBe(true);
      expect(screen.getAllByTestId(field)).toHaveLength(1);
      await act(async () => { fireEvent.change(input, { target: { value: "a <&>\r\nb" } }); });
      expect(input.value).toBe("a <&> b");
      expect(saved()).toBe(source);
      await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
      expect(screen.getAllByTestId(field)).toHaveLength(count);
      expect(screen.getAllByTestId(enterField)[count - 1]).toHaveFocus();
      expect(saved()).toBe(source);
    } finally { view.unmount(); }
  });
});
