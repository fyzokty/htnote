import { createElement } from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dispatchShortcut, installShortcutListener } from "@/lib/shortcuts/manager";
import { useShortcut } from "@/lib/shortcuts/useShortcut";

let removeListener: (() => void) | undefined;

afterEach(() => {
  removeListener?.();
  removeListener = undefined;
});

function Subscriber({ enabled = true, handler }: { enabled?: boolean; handler: () => void }) {
  useShortcut("toggleSidebar", handler, { enabled });
  return null;
}

describe("useShortcut", () => {
  it("abone olur, güncel handler'ı kullanır ve çıkışta aboneliği kaldırır", () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = render(createElement(Subscriber, { handler: first }));
    expect(dispatchShortcut("toggleSidebar")).toBe(true);
    expect(first).toHaveBeenCalledOnce();

    view.rerender(createElement(Subscriber, { handler: second }));
    dispatchShortcut("toggleSidebar");
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();

    view.unmount();
    expect(dispatchShortcut("toggleSidebar")).toBe(false);
  });

  it("enabled false iken abone olmaz", () => {
    const handler = vi.fn();
    const view = render(createElement(Subscriber, { enabled: false, handler }));
    expect(dispatchShortcut("toggleSidebar")).toBe(false);
    view.rerender(createElement(Subscriber, { enabled: true, handler }));
    expect(dispatchShortcut("toggleSidebar")).toBe(true);
    view.rerender(createElement(Subscriber, { enabled: false, handler }));
    expect(dispatchShortcut("toggleSidebar")).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("capture listener", () => {
  it("ignores F2 in inputs while allowing Ctrl+N", () => {
    const rename = vi.fn();
    const create = vi.fn();
    function TreeSubscribers() {
      useShortcut("rename", rename);
      useShortcut("newNote", create);
      return createElement("input", { "aria-label": "name" });
    }
    const view = render(createElement(TreeSubscribers));
    removeListener = installShortcutListener();
    const input = view.getByRole("textbox");
    fireEvent.keyDown(input, { key: "F2", code: "F2" });
    fireEvent.keyDown(input, { key: "n", code: "KeyN", ctrlKey: true });
    expect(rename).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
  });
  it("input odaktayken kısayolu editörden önce yakalar", () => {
    const handler = vi.fn();
    const bubble = vi.fn();
    render(createElement(Subscriber, { handler }));
    removeListener = installShortcutListener();
    const input = document.createElement("input");
    document.body.append(input);
    input.addEventListener("keydown", bubble);
    input.focus();

    const event = new KeyboardEvent("keydown", { key: "\\", code: "Backslash", ctrlKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    expect(bubble).not.toHaveBeenCalled();
    input.remove();
  });

  it("Escape'i odaktaki input'a bırakır", () => {
    const handler = vi.fn();
    function EscapeSubscriber() {
      useShortcut("escape", handler);
      return createElement("input", { "aria-label": "test" });
    }
    const view = render(createElement(EscapeSubscriber));
    removeListener = installShortcutListener();
    const input = view.getByRole("textbox");
    const event = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true });
    fireEvent(input, event);
    expect(handler).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
