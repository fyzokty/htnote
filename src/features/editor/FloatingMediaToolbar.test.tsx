import { createRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FloatingMediaToolbar } from "./FloatingMediaToolbar";
import { setStickyToolbarInset } from "./editorViewport";

it("hides media behind the sticky toolbar and reveals it when it returns to the editor viewport", () => {
  const anchor = createRef<HTMLDivElement>();
  let preview = new DOMRect(30, 45, 200, 40);
  const measure = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.classList.contains("htnote-visual-scroll")) return new DOMRect(0, 40, 600, 500);
    if (this.classList.contains("htnote-media-preview")) return preview;
    return new DOMRect(0, 0, 200, 40);
  });
  const view = render(<div className="htnote-visual-scroll"><div className="ProseMirror">
    <div ref={anchor}><div className="htnote-media-preview" /></div>
    <FloatingMediaToolbar anchor={anchor} selected align="left"><button aria-label="test" /></FloatingMediaToolbar>
  </div></div>);
  try {
    const scroll = view.container.firstElementChild!;
    const menu = document.querySelector<HTMLElement>(".htnote-media-floating")!;
    expect(menu).toBeVisible();
    setStickyToolbarInset(scroll, 64);
    fireEvent.scroll(scroll);
    expect(menu).not.toBeVisible();
    preview = new DOMRect(30, 120, 200, 40);
    fireEvent.scroll(scroll);
    expect(menu).toBeVisible();
  } finally { view.unmount(); measure.mockRestore(); }
});
