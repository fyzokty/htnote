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
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_READY", noteId: "123e4567-e89b-12d3-a456-426614174000", path: location.pathname }, "*");
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-ht-theme");
    messages.mockClear();
    vi.spyOn(window.parent, "postMessage").mockImplementation(messages);
  });

  it("exposes frozen note metadata within the size limit", () => {
    expect(Object.isFrozen((window as unknown as { htnote: object }).htnote)).toBe(true);
    expect(new TextEncoder().encode(source).length).toBeLessThan(6144);
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
    for (const letter of ["e", "w", "n"]) {
      expect(key(letter, `Key${letter.toUpperCase()}`, { ctrlKey: true }).defaultPrevented).toBe(true);
    }
    expect(key("N", "KeyN", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(key("F", "KeyF", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(key("Tab", "Tab", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key("Tab", "Tab", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(key("\\", "Backslash", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key("Escape", "Escape").defaultPrevented).toBe(true);
    expect(key("x", "KeyX", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key("s", "KeyS", { ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(key("x", "KeyX").defaultPrevented).toBe(false);
    expect(messages).toHaveBeenCalledTimes(12);
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_SHORTCUT", key: "s", ctrl: true, shift: false, alt: false, meta: false }, "*");
  });

  it("handles Mac Mod and Ctrl tab shortcuts and forwards other modifier keys", () => {
    const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const key = (name: string, code: string, options: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent("keydown", { key: name, code, bubbles: true, cancelable: true, ...options });
      document.dispatchEvent(event);
      return event;
    };
    try {
      expect(key("s", "KeyS", { metaKey: true }).defaultPrevented).toBe(true);
      expect(key("s", "KeyS", { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(key("Tab", "Tab", { metaKey: true }).defaultPrevented).toBe(true);
      expect(key("Tab", "Tab", { metaKey: true, shiftKey: true }).defaultPrevented).toBe(true);
      expect(key("Tab", "Tab", { ctrlKey: true }).defaultPrevented).toBe(true);
      expect(key("Tab", "Tab", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
      expect(key("Escape", "Escape", { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(key("x", "KeyX", { altKey: true }).defaultPrevented).toBe(false);
      expect(key("x", "KeyX", { shiftKey: true }).defaultPrevented).toBe(false);
      expect(messages).toHaveBeenCalledTimes(9);
      expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_SHORTCUT", key: "Escape", ctrl: true, shift: false, alt: false, meta: false }, "*");
    } finally {
      platform.mockRestore();
    }
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
    expect(Array.from(document.querySelectorAll("p mark")).map((mark) => mark.textContent)).toEqual(["İ", "i"]);
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "ı" });
    expect(document.querySelectorAll("mark[data-htnote-hl]")).toHaveLength(2);
    expect(Array.from(document.querySelectorAll("p mark")).map((mark) => mark.textContent)).toEqual(["I", "ı"]);
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "" });
    expect(document.querySelectorAll("mark[data-htnote-hl]")).toHaveLength(0);
    expect(document.querySelector("p")?.textContent).toBe("İ i I ı");
  });

  it("keeps source offsets when Turkish folding changes text length", () => {
    document.body.innerHTML = "<p>I\u0307i İi Iı</p>";
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "İi" });
    expect(Array.from(document.querySelectorAll("p mark")).map((mark) => mark.textContent)).toEqual(["I\u0307i", "İi"]);
    expect(document.querySelector("p")?.textContent).toBe("I\u0307i İi Iı");
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "Iı" });
    expect(Array.from(document.querySelectorAll("p mark")).map((mark) => mark.textContent)).toEqual(["Iı"]);
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "" });
    expect(document.querySelector("p")?.textContent).toBe("I\u0307i İi Iı");
  });

  it("highlights separate text nodes and clears marks without removing elements", () => {
    document.body.innerHTML = "<p>İstanbul <strong>istanbul</strong></p>";
    hostMessage({ type: "HTNOTE_HIGHLIGHT", query: "istanbul" });
    expect(document.querySelectorAll("mark.htnote-highlight")).toHaveLength(2);
    hostMessage({ type: "HTNOTE_CLEAR_HIGHLIGHT" });
    expect(document.querySelectorAll("mark.htnote-highlight")).toHaveLength(0);
    expect(document.querySelector("strong")?.textContent).toBe("istanbul");
  });

  it("restores scroll only from the parent and reports scroll changes", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    hostMessage({ type: "HTNOTE_SCROLL_RESTORE", scrollY: 42 }, null);
    expect(scrollTo).not.toHaveBeenCalled();
    hostMessage({ type: "HTNOTE_SCROLL_RESTORE", scrollY: 42, token: "document-token" });
    expect(scrollTo).toHaveBeenCalledWith(0, 42);
    window.dispatchEvent(new Event("scroll"));
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_SCROLL", scrollY: window.scrollY, path: location.pathname, token: "document-token" }, "*");
    frame.mockRestore();
    scrollTo.mockRestore();
  });

  it("uses light theme for print mode", () => {
    history.replaceState(null, "", `${location.pathname}?print=1`);
    try {
      window.eval(source);
      expect(document.documentElement.dataset.htTheme).toBe("light");
      expect(document.documentElement.style.getPropertyValue("--ht-bg")).toBe("#f9fafb");
      expect(document.documentElement.style.getPropertyValue("--ht-text")).toBe("#111827");
    } finally {
      history.replaceState(null, "", location.pathname);
    }
  });
});
