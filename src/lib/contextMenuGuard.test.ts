import { afterEach, describe, expect, it, vi } from "vitest";
import { allowsNativeContextMenu, installContextMenuGuard } from "./contextMenuGuard";

afterEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

function target(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.querySelector<HTMLElement>("[data-target]")!;
}

function menu(element: EventTarget): MouseEvent {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

describe("context menu guard", () => {
  it.each(["text", "search", "email", "url", "tel", "password", "number", "invalid"])("allows text input type %s", (type) => {
    expect(allowsNativeContextMenu(target(`<input type="${type}" data-target>`), null)).toBe(true);
  });

  it.each(["checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "date", "hidden"])("blocks non-text input type %s", (type) => {
    expect(allowsNativeContextMenu(target(`<input type="${type}" data-target>`), null)).toBe(false);
  });

  it.each([
    "<textarea data-target></textarea>",
    '<div contenteditable><span data-target></span></div>',
    '<div contenteditable="true"><span data-target></span></div>',
    '<div contenteditable="plaintext-only"><span data-target></span></div>',
    '<div class="cm-editor"><div data-target></div></div>',
  ])("allows editable descendants: %s", (html) => {
    expect(allowsNativeContextMenu(target(html), null)).toBe(true);
  });

  it("blocks non-editable islands and ordinary targets", () => {
    expect(allowsNativeContextMenu(target('<div contenteditable><span contenteditable="false" data-target></span></div>'), null)).toBe(false);
    expect(allowsNativeContextMenu(target("<button data-target></button>"), null)).toBe(false);
    expect(allowsNativeContextMenu(null, null)).toBe(false);
  });

  it("allows only non-empty selections intersecting the target", () => {
    const element = target("<p data-target><span>Selected text</span></p><p id='other'>Other text</p>");
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(element.firstChild!);
    selection.addRange(range);
    expect(allowsNativeContextMenu(element, selection)).toBe(true);
    expect(allowsNativeContextMenu(element.firstChild!.firstChild, selection)).toBe(true);
    expect(allowsNativeContextMenu(document.getElementById("other"), selection)).toBe(false);
    range.collapse(true);
    expect(allowsNativeContextMenu(element, selection)).toBe(false);
    element.textContent = "   ";
    range.selectNodeContents(element);
    expect(allowsNativeContextMenu(element, selection)).toBe(false);
  });

  it("allows a selection spanning paragraphs only on intersecting targets", () => {
    const first = target("<section><p data-target>First paragraph</p><p>Middle paragraph</p><p>Last paragraph</p><p>Other text</p></section>");
    const [, middle, last, other] = document.querySelectorAll("p");
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(first.firstChild!, 2);
    range.setEnd(last.firstChild!, 4);
    selection.addRange(range);
    const cleanup = installContextMenuGuard();
    try {
      for (const paragraph of [first, middle, last]) {
        expect(menu(paragraph).defaultPrevented).toBe(false);
        expect(menu(paragraph.firstChild!).defaultPrevented).toBe(false);
      }
      expect(menu(other).defaultPrevented).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("runs after component handlers, preserves custom menus and can be removed", () => {
    const element = target("<div data-target></div>");
    const cleanup = installContextMenuGuard();
    try {
      const custom = vi.fn((event: Event) => {
        expect(event.defaultPrevented).toBe(false);
        event.preventDefault();
        event.stopPropagation();
      });
      element.addEventListener("contextmenu", custom);
      expect(menu(element).defaultPrevented).toBe(true);
      expect(custom).toHaveBeenCalledOnce();
      element.removeEventListener("contextmenu", custom);
      expect(menu(element).defaultPrevented).toBe(true);
      expect(menu(target("<input data-target>")).defaultPrevented).toBe(false);
    } finally {
      cleanup();
    }
    expect(menu(document.body).defaultPrevented).toBe(false);
  });
});
