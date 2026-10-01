import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { createVisualExtensions } from "@/features/editor/extensions";
import { wrapRawBlocks } from "@/features/editor/visualPipeline";

it("shows five plain text lines and requests code mode without executing raw HTML", () => {
  const attack = '<img src=x onerror="window.attack()"><script>window.attack()</script>\n2\n3\n4\n5\n6';
  const spy = vi.fn();
  Object.defineProperty(window, "attack", { configurable: true, value: spy });
  const onEdit = vi.fn();
  const editor = new Editor({ extensions: createVisualExtensions("", onEdit), content: wrapRawBlocks(attack) });
  const view = render(<EditorContent editor={editor} />);
  const preview = view.container.querySelector(".htnote-html-block pre");
  expect(preview?.textContent).toContain("<img src=x onerror");
  expect(preview?.textContent).not.toContain("6");
  expect(view.container.querySelector(".htnote-html-block img")).toBeNull();
  expect(view.container.querySelector(".htnote-html-block script")).toBeNull();
  expect(spy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Kod modunda düzenle" }));
  expect(onEdit).toHaveBeenCalledOnce();
  view.unmount();
  editor.destroy();
});
