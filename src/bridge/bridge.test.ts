import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import source from "./bridge.js?raw";

const messages = vi.fn();

function hostMessage(data: object, sourceWindow: MessageEventSource | null = window.parent) {
  window.dispatchEvent(new MessageEvent("message", { data, source: sourceWindow }));
}

function click(href: string, type = "click") {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = "link";
  document.body.append(link);
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  link.dispatchEvent(event);
  return event;
}

describe("note bridge", () => {
  beforeAll(() => {
    history.replaceState(null, "", "/123e4567-e89b-12d3-a456-426614174000/index.html");
    vi.spyOn(window.parent, "postMessage").mockImplementation(messages);
    window.eval(source);
    window.dispatchEvent(new Event("load"));
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_READY", noteId: "123e4567-e89b-12d3-a456-426614174000" }, "*");
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-ht-theme");
    messages.mockClear();
    vi.spyOn(window.parent, "postMessage").mockImplementation(messages);
  });

  it("exposes frozen note metadata within the size limit", () => {
    expect(Object.isFrozen((window as unknown as { htnote: object }).htnote)).toBe(true);
    expect(new TextEncoder().encode(source).length).toBeLessThan(5120);
  });

  it("routes note and external links, blocks unsafe links, and leaves anchors alone", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(click(`htnote://note/${id}`).defaultPrevented).toBe(true);
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_OPEN_NOTE", id }, "*");
    expect(click("https://example.com", "auxclick").defaultPrevented).toBe(true);
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_OPEN_EXTERNAL", url: "https://example.com" }, "*");
    expect(click("mailto:test@example.com").defaultPrevented).toBe(true);
    messages.mockClear();
    for (const url of ["javascript:alert(1)", "file:///test", "htnote-note://localhost/a", "htnote://note/invalid"]) {
      expect(click(url).defaultPrevented).toBe(true);
    }
    expect(messages).not.toHaveBeenCalled();
    expect(click("#section").defaultPrevented).toBe(false);
  });

  it("routes window.open only for external URLs", () => {
    expect(window.open("https://example.com")).toBeNull();
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_OPEN_EXTERNAL", url: "https://example.com" }, "*");
    messages.mockClear();
    expect(window.open("javascript:alert(1)")).toBeNull();
    expect(messages).not.toHaveBeenCalled();
  });

  it("forwards modifier shortcuts and Escape, preventing only recognized combinations", () => {
    const key = (name: string, code: string, options: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent("keydown", { key: name, code, bubbles: true, cancelable: true, ...options });
      document.dispatchEvent(event);
      return event;
    };
    expect(key("s", "KeyS", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key("N", "KeyN", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(key("Tab", "Tab", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(key("\\", "Backslash", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key("Escape", "Escape").defaultPrevented).toBe(true);
    expect(key("x", "KeyX", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key("x", "KeyX").defaultPrevented).toBe(false);
    expect(messages).toHaveBeenCalledTimes(6);
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_SHORTCUT", key: "s", ctrl: true, shift: false, alt: false, meta: false }, "*");
  });

  it("applies trusted theme messages and highlights Turkish matches, then clears them", () => {
    document.body.innerHTML = "<p>İ i I ı</p><script>İ i</script><style>İ i</style>";
    hostMessage({ type: "HTNOTE_THEME", vars: { "--ht-bg": "red", "--other": "blue" }, mode: "dark" }, null);
    expect(document.documentElement.style.getPropertyValue("--ht-bg")).toBe("");
    hostMessage({ type: "HTNOTE_THEME", vars: { "--ht-bg": "red", "--other": "blue" }, mode: "dark" });
    expect(document.documentElement.style.getPropertyValue("--ht-bg")).toBe("red");
    expect(document.documentElement.style.getPropertyValue("--other")).toBe("");
    expect(document.documentElement.dataset.htTheme).toBe("dark");
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "i" });
    expect(document.querySelectorAll("mark[data-htnote-hl]")).toHaveLength(2);
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "ı" });
    expect(document.querySelectorAll("mark[data-htnote-hl]")).toHaveLength(2);
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "" });
    expect(document.querySelectorAll("mark[data-htnote-hl]")).toHaveLength(0);
    expect(document.querySelector("p")?.textContent).toBe("İ i I ı");
  });
});
