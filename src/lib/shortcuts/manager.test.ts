import { createElement } from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dispatchShortcut, installShortcutListener, scheduleUnboundShortcutWarnings, subscribeShortcut } from "@/lib/shortcuts/manager";
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
  it("kod editöründe uygulama kısayollarını yakalar, düzenleme tuşlarını geçirir", () => {
    const calls = { save: vi.fn(), edit: vi.fn(), close: vi.fn() };
    function CodeSubscribers() {
      useShortcut("save", calls.save);
      useShortcut("toggleEdit", calls.edit);
      useShortcut("closeTab", calls.close);
      return createElement("div", { contentEditable: true, role: "textbox" });
    }
    const view = render(createElement(CodeSubscribers));
    removeListener = installShortcutListener();
    const editor = view.getByRole("textbox");
    for (const key of ["s", "e", "w", "f", "z", "b"]) {
      const event = new KeyboardEvent("keydown", { key, code: `Key${key.toUpperCase()}`, ctrlKey: true, bubbles: true, cancelable: true });
      editor.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(["s", "e", "w"].includes(key));
    }
    expect(calls.save).toHaveBeenCalledOnce();
    expect(calls.edit).toHaveBeenCalledOnce();
    expect(calls.close).toHaveBeenCalledOnce();
  });
  it("leaves Ctrl+B/I/U to the focused editor", () => {
    const handler = vi.fn();
    render(createElement(Subscriber, { handler }));
    removeListener = installShortcutListener();
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    document.body.append(editor);
    for (const key of ["b", "i", "u"]) {
      const event = new KeyboardEvent("keydown", { key, code: `Key${key.toUpperCase()}`, ctrlKey: true, bubbles: true, cancelable: true });
      editor.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(handler).not.toHaveBeenCalled();
    editor.remove();
  });
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

  it("toggles sidebar with Ctrl+Shift+B while the editor is focused", () => {
    const handler = vi.fn();
    render(createElement(Subscriber, { handler }));
    removeListener = installShortcutListener();
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    document.body.append(editor);
    const input = { key: "B", code: "KeyB", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true };
    const editorEvent = new KeyboardEvent("keydown", input);
    editor.dispatchEvent(editorEvent);
    expect(editorEvent.defaultPrevented).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    const pageEvent = new KeyboardEvent("keydown", input);
    document.body.dispatchEvent(pageEvent);
    expect(pageEvent.defaultPrevented).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
    editor.remove();
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

describe("unbound shortcut check", () => {
  it("warns once per unbound shortcut after three seconds", () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unsubscribe = subscribeShortcut("showShortcuts", () => {});
    const cancel = scheduleUnboundShortcutWarnings();
    vi.advanceTimersByTime(2999);
    expect(warn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(warn).toHaveBeenCalledWith("Unbound shortcut: newNote");
    expect(warn).not.toHaveBeenCalledWith("Unbound shortcut: showShortcuts");
    expect(warn).not.toHaveBeenCalledWith("Unbound shortcut: editorBold");
    cancel();
    unsubscribe();
    warn.mockRestore();
    vi.useRealTimers();
  });
});
