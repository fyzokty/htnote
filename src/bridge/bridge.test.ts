import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import source from "./bridge.js?raw";
import { writeNoteBackground } from "@/features/viewer/noteAppearance";

const messages = vi.fn();
let scrollbarShadow: ShadowRoot;

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
    document.body.innerHTML = '<video controls></video><audio controls></audio>';
    vi.spyOn(window.parent, "postMessage").mockImplementation(messages);
    const attach = Element.prototype.attachShadow;
    const spy = vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (this: Element, options) {
      const shadow = attach.call(this, options);
      if (this.hasAttribute("data-htnote-scrollbars")) scrollbarShadow = shadow;
      return shadow;
    });
    window.eval(source);
    spy.mockRestore();
    expect(document.querySelector("video")).toHaveAttribute("controlslist", "nodownload");
    expect(document.querySelector("audio")?.hidden).toBe(true);
    expect(document.querySelector(".ht-audio-player")?.shadowRoot).not.toBeNull();
    window.dispatchEvent(new Event("load"));
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_READY", noteId: "123e4567-e89b-12d3-a456-426614174000", path: location.pathname }, "*");
  });

  beforeEach(() => {
    window.getSelection()?.removeAllRanges();
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-ht-theme");
    messages.mockClear();
    vi.spyOn(window.parent, "postMessage").mockImplementation(messages);
  });

  it.each([
    ["<div data-target></div>", true],
    ['<input type="checkbox" data-target>', true],
    ['<input type="search" data-target>', false],
    ["<textarea data-target></textarea>", false],
    ['<div contenteditable><span data-target></span></div>', false],
    ['<div contenteditable="plaintext-only"><span data-target></span></div>', false],
    ['<div contenteditable><span contenteditable="false" data-target></span></div>', true],
    ['<div class="cm-editor"><span data-target></span></div>', false],
    ['<div contenteditable><video data-target></video></div>', true],
  ])("guards native menus locally: %s", (html, prevented) => {
    document.body.innerHTML = html;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.querySelector("[data-target]")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(prevented);
    expect(messages).not.toHaveBeenCalled();
  });

  it("allows copying a selection only when it intersects its context menu target", () => {
    document.body.innerHTML = "<p><strong>Selected text</strong></p><div>Other</div><video></video>";
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("strong")!);
    selection.addRange(range);
    const dispatch = (element: Element) => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(dispatch(document.querySelector("p")!)).toBe(false);
    expect(dispatch(document.querySelector("div")!)).toBe(true);
    range.selectNodeContents(document.querySelector("video")!);
    expect(dispatch(document.querySelector("video")!)).toBe(true);
    range.collapse(true);
    expect(dispatch(document.querySelector("p")!)).toBe(true);
    document.querySelector("p")!.textContent = "   ";
    range.selectNodeContents(document.querySelector("p")!);
    expect(dispatch(document.querySelector("p")!)).toBe(true);
    expect(messages).not.toHaveBeenCalled();
  });

  it("allows copying a selection spanning paragraphs only on intersecting targets", () => {
    document.body.innerHTML = "<section><p>First paragraph</p><p>Middle paragraph</p><p>Last paragraph</p><p>Other text</p></section>";
    const [first, middle, last, other] = document.querySelectorAll("p");
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(first.firstChild!, 2);
    range.setEnd(last.firstChild!, 4);
    selection.addRange(range);
    const dispatch = (target: EventTarget) => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    for (const paragraph of [first, middle, last]) {
      expect(dispatch(paragraph)).toBe(false);
      expect(dispatch(paragraph.firstChild!)).toBe(false);
    }
    expect(dispatch(other)).toBe(true);
    expect(messages).not.toHaveBeenCalled();
  });

  it("lets a custom menu handle the event before the bubbling guard", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const custom = vi.fn((event: Event) => {
      expect(event.defaultPrevented).toBe(false);
      event.preventDefault();
      event.stopPropagation();
    });
    element.addEventListener("contextmenu", custom);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    expect(custom).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("forwards and prevents settings shortcut when the note has focus", () => {
    const event = new KeyboardEvent("keydown", { key: ",", code: "Comma", ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(messages).toHaveBeenCalledWith({ type: "HTNOTE_SHORTCUT", key: ",", ctrl: true, shift: false, alt: false, meta: false }, "*");
  });

  it("exposes frozen note metadata within the size limit", () => {
    expect(Object.isFrozen((window as unknown as { htnote: object }).htnote)).toBe(true);
    // Ses oynatıcı ve kök kaplama çubuğu ayrı paket yerine köprüde sunulur.
    expect(new TextEncoder().encode(source).length).toBeLessThan(32768);
  });

  it("uses low-specificity theme defaults and the portable preset stylesheet", () => {
    expect(document.getElementById("htnote-scrollbars")?.textContent).toContain(":where(html){background:var(--ht-note-bg,var(--ht-bg));color:var(--ht-text)");
    const saved = writeNoteBackground('<html><head></head><body><p>Note</p></body></html>', "sepia");
    const note = new DOMParser().parseFromString(saved, "text/html");
    expect(note.body.dataset.htBg).toBe("sepia");
    expect(note.getElementById("htnote-appearance")?.textContent).toContain(':where(html:has(body[data-ht-bg="sepia"]))');
    expect(note.getElementById("htnote-appearance")?.textContent).toContain(':where(html[data-ht-theme="dark"])');
    hostMessage({ type: "HTNOTE_THEME", mode: "dark", vars: { "--ht-bg": "#1e293b", "--ht-text": "#f1f5f9", "--ht-color-red": "#fb929e" } });
    expect(document.documentElement.dataset.htTheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--ht-bg")).toBe("#1e293b");
    expect(document.documentElement.style.getPropertyValue("--ht-color-red")).toBe("#fb929e");
    document.documentElement.style.removeProperty("--ht-bg");
    document.documentElement.style.removeProperty("--ht-text");
    document.documentElement.style.removeProperty("--ht-color-red");
  });

  it("injects one low-specificity scrollbar stylesheet and follows trusted theme tokens", () => {
    const styles = document.querySelectorAll("#htnote-scrollbars");
    expect(styles).toHaveLength(1);
    expect(styles[0].parentElement).toBe(document.head);
    expect(document.head.firstElementChild).toBe(styles[0]);
    expect(styles[0].textContent).toContain(":where(*)::-webkit-scrollbar-thumb");
    expect(styles[0].textContent).toContain("scrollbar-width:thin");
    expect(styles[0].textContent).not.toContain("!important");
    for (const mode of ["light", "dark"]) {
      const vars = { "--ht-scrollbar": `var(--${mode}-thumb)`, "--ht-scrollbar-hover": `var(--${mode}-hover)` };
      hostMessage({ type: "HTNOTE_THEME", vars, mode }, null);
      expect(document.documentElement.style.getPropertyValue("--ht-scrollbar")).not.toBe(vars["--ht-scrollbar"]);
      hostMessage({ type: "HTNOTE_THEME", vars, mode });
      expect(document.documentElement.style.getPropertyValue("--ht-scrollbar")).toBe(vars["--ht-scrollbar"]);
      expect(document.documentElement.style.getPropertyValue("--ht-scrollbar-hover")).toBe(vars["--ht-scrollbar-hover"]);
      expect(document.documentElement.dataset.htTheme).toBe(mode);
    }
    expect(document.querySelectorAll("#htnote-scrollbars")).toHaveLength(1);
    const author = document.createElement("style");
    author.textContent = ".author-scroll { scrollbar-width: auto; }";
    document.head.append(author);
    const scroller = document.createElement("div");
    document.body.append(scroller);
    expect(getComputedStyle(scroller).scrollbarWidth).toBe("thin");
    scroller.className = "author-scroll";
    expect(getComputedStyle(scroller).scrollbarWidth).toBe("auto");
    author.remove();
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

  it("forwards relative attachment links without resolving or decoding their paths", () => {
    for (const href of ["./assets/report.pdf", "assets/report.PDF", "./assets/%C4%B0stanbul%20rapor.pdf", "assets/a%25b%23c.txt"]) {
      expect(click(href, "auxclick").defaultPrevented).toBe(true);
      expect(messages).toHaveBeenLastCalledWith({ type: "HTNOTE_OPEN_ASSET", relPath: href }, "*");
    }
    messages.mockClear();
    for (const href of ["../assets/report.pdf", "/assets/report.pdf", "other/report.pdf", "//evil.test/assets/report.pdf"]) {
      expect(click(href).defaultPrevented).toBe(true);
    }
    expect(messages).not.toHaveBeenCalled();
  });

  it("prints only when the parent requests it", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    hostMessage({ type: "HTNOTE_PRINT" }, null);
    expect(print).not.toHaveBeenCalled();
    hostMessage({ type: "HTNOTE_PRINT" });
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
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
    expect(key("/", "Digit7", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(key("/", "NumpadDivide", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key("B", "KeyB", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(key("Escape", "Escape").defaultPrevented).toBe(true);
    expect(key("x", "KeyX", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key("s", "KeyS", { ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(key("x", "KeyX").defaultPrevented).toBe(false);
    expect(messages).toHaveBeenCalledTimes(15);
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
      expect(key("Tab", "Tab", { metaKey: true }).defaultPrevented).toBe(false);
      expect(key("Tab", "Tab", { metaKey: true, shiftKey: true }).defaultPrevented).toBe(false);
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

  it("constrains media with low specificity so author sizes win", () => {
    expect(document.querySelector("#htnote-paragraph-base")?.textContent)
      .toBe(":where(#htnote-content p){margin:0.3em 0;min-height:1lh}");
    expect(document.querySelector("#htnote-media-base")?.textContent).toContain(":where(video,img){max-width:100%;height:auto}");
    expect(document.querySelector("#htnote-media-base")?.textContent).toContain(":where(video){max-height:75vh}");
    const author = document.createElement("style");
    author.textContent = "video.author-video { max-height: 900px; max-width: 70%; }";
    document.head.append(author);
    document.body.innerHTML = '<video class="author-video"></video>';
    expect(getComputedStyle(document.querySelector("video")!).maxHeight).toBe("900px");
    expect(getComputedStyle(document.querySelector("video")!).maxWidth).toBe("70%");
    author.remove();
  });

  it("enhances dynamically added media, preserves control tokens and blocks video saving", async () => {
    document.body.innerHTML = '<video controls controlslist="noremoteplayback"></video><audio data-ht-native controls></audio>';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const video = document.querySelector("video")!;
    expect(video).toHaveAttribute("controlslist", "noremoteplayback nodownload");
    expect(document.querySelector("audio")).toHaveAttribute("controlslist", "nodownload");
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    video.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    const dynamic = document.createElement("video");
    document.body.append(dynamic);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dynamic).toHaveAttribute("controlslist", "nodownload");
  });

  it("wraps only audio with controls, supports native opt-out and restores removed players", async () => {
    document.body.innerHTML = '<audio controls src="./assets/a.wav"></audio><audio controls data-ht-native></audio><audio></audio>';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [audio, native, scriptOnly] = document.querySelectorAll("audio");
    expect(document.querySelectorAll(".ht-audio-player")).toHaveLength(1);
    expect(audio.hidden).toBe(true);
    expect(native.hidden).toBe(false);
    expect(scriptOnly.hidden).toBe(false);
    audio.setAttribute("data-ht-native", "");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector(".ht-audio-player")).toBeNull();
    expect(audio.hidden).toBe(false);
    audio.removeAttribute("data-ht-native");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const host = document.querySelector(".ht-audio-player")!;
    expect(host.shadowRoot?.querySelector(".ht-audio-title")).toHaveTextContent("a.wav");
    audio.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(host.isConnected).toBe(false);
    expect(audio.hidden).toBe(false);
  });

  it("localizes shadow controls and follows trusted theme changes without rebuilding audio", async () => {
    document.body.innerHTML = '<audio controls src="./assets/a.wav"></audio>';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const audio = document.querySelector("audio")!;
    const shadow = document.querySelector(".ht-audio-player")!.shadowRoot!;
    const labels = { play: "Oynat", pause: "Duraklat", mute: "Sesi kapat", unmute: "Sesi aç", seek: "Ses konumu" };
    hostMessage({ type: "HTNOTE_THEME", mode: "dark", vars: { "--ht-audio-surface": "dark-card" }, audioLabels: labels }, null);
    expect(shadow.querySelector("button")).not.toHaveAttribute("aria-label", "Oynat");
    hostMessage({ type: "HTNOTE_THEME", mode: "dark", vars: { "--ht-audio-surface": "dark-card" }, audioLabels: labels });
    expect(shadow.querySelector("button")).toHaveAttribute("aria-label", "Oynat");
    expect(document.documentElement.style.getPropertyValue("--ht-audio-surface")).toBe("dark-card");
    hostMessage({ type: "HTNOTE_THEME", mode: "light", vars: { "--ht-audio-surface": "light-card" }, audioLabels: { play: "Play" } });
    expect(shadow.querySelector("button")).toHaveAttribute("title", "Play");
    expect(document.documentElement.style.getPropertyValue("--ht-audio-surface")).toBe("light-card");
    expect(document.querySelector("audio")).toBe(audio);
    expect(shadow.querySelector("style")?.textContent).toContain("prefers-reduced-motion:reduce");
  });

  it("plays, mutes and seeks shadow audio with keyboard and pointer controls", async () => {
    document.body.innerHTML = '<audio controls title="Recording"><source src="./assets/test.wav"></audio>';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const audio = document.querySelector("audio")!;
    let paused = true;
    Object.defineProperties(audio, { duration: { configurable: true, value: 125 }, paused: { configurable: true, get: () => paused } });
    const play = vi.spyOn(audio, "play").mockImplementation(async () => { paused = false; audio.dispatchEvent(new Event("play")); });
    const pause = vi.spyOn(audio, "pause").mockImplementation(() => { paused = true; audio.dispatchEvent(new Event("pause")); });
    audio.dispatchEvent(new Event("loadedmetadata"));
    const shadow = document.querySelector(".ht-audio-player")!.shadowRoot!;
    const slider = shadow.querySelector<HTMLElement>("[role=slider]")!;
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    expect(play).toHaveBeenCalledOnce();
    expect(shadow.querySelector(".ht-audio-card")).toHaveAttribute("data-playing", "true");
    shadow.querySelector<HTMLButtonElement>(".ht-audio-play")!.click();
    expect(pause).toHaveBeenCalledOnce();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(audio.currentTime).toBe(5);
    expect(slider).toHaveAttribute("aria-valuenow", "5");
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(audio.currentTime).toBe(0);
    expect(shadow.querySelector(".ht-audio-time")).toHaveTextContent("0:00 / 2:05");
    slider.setPointerCapture = vi.fn(); slider.hasPointerCapture = () => true; slider.releasePointerCapture = vi.fn();
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({ left: 10, width: 100 } as DOMRect);
    slider.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 60, bubbles: true }));
    expect(audio.currentTime).toBe(62.5);
    slider.dispatchEvent(new MouseEvent("pointermove", { clientX: 110, bubbles: true }));
    expect(audio.currentTime).toBe(125);
    shadow.querySelector<HTMLButtonElement>(".ht-audio-mute")!.click();
    expect(audio.muted).toBe(true);
    expect(shadow.querySelector(".ht-audio-title small")).toHaveTextContent("test.wav");
  });

  it("uses light theme for print mode", () => {
    history.replaceState(null, "", `${location.pathname}?print=1`);
    try {
      window.eval(source);
      expect(document.querySelectorAll("#htnote-scrollbars")).toHaveLength(1);
      expect(document.documentElement.dataset.htTheme).toBe("light");
      expect(document.documentElement.style.getPropertyValue("--ht-bg")).toBe("#f9fafb");
      expect(document.documentElement.style.getPropertyValue("--ht-text")).toBe("#111827");
    } finally {
      history.replaceState(null, "", location.pathname);
    }
  });

  it("applies content width via low-specificity style sheet allowing author styles to win", () => {
    const baseStyle = document.createElement("style");
    baseStyle.setAttribute("data-htnote", "base");
    baseStyle.textContent = "body { max-width: 860px; margin: 0 auto; }";
    document.head.append(baseStyle);

    hostMessage({ type: "HTNOTE_CONTENT_WIDTH", contentWidth: "narrow" });
    expect(document.documentElement.dataset.htContentWidth).toBe("narrow");
    const styleEl = document.getElementById("htnote-content-width");
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain(":where(body){max-width:680px");
    // Verify base style's body selector was rewritten to :where(body) to maintain low specificity
    expect(baseStyle.textContent).toContain(":where(body)");

    hostMessage({ type: "HTNOTE_CONTENT_WIDTH", contentWidth: "full" });
    expect(document.documentElement.dataset.htContentWidth).toBe("full");
    expect(styleEl?.textContent).toContain(":where(body){max-width:100%");

    // Author style test: author's body style has specificity (0,0,1) which wins over :where(body) (0,0,0)
    const authorStyle = document.createElement("style");
    authorStyle.textContent = "body { max-width: 550px; }";
    document.head.append(authorStyle);

    expect(getComputedStyle(document.body).maxWidth).toBe("550px");

    authorStyle.remove();
    baseStyle.remove();
    styleEl?.remove();
  });
});

it("isolates root overlay geometry, scroll visibility and drag in a closed shadow", () => {
  const root = document.documentElement;
  const host = root.querySelector<HTMLElement>("[data-htnote-scrollbars]")!;
  expect(host.shadowRoot).toBeNull();
  expect(host.style.position).toBe("fixed");
  expect(host.style.getPropertyPriority("all")).toBe("important");
  expect(getComputedStyle(root).scrollbarWidth).toBe("none");
  expect(scrollbarShadow.querySelector("style")?.textContent).toContain("@media print");
  Object.defineProperty(document, "scrollingElement", { configurable: true, value: root });
  Object.defineProperties(root, { clientHeight: { configurable: true, value: 100 }, scrollHeight: { configurable: true, value: 400 } });
  root.scrollTop = 0;
  window.dispatchEvent(new Event("scroll"));
  const track = scrollbarShadow.querySelector<HTMLElement>(".vertical")!;
  const thumb = track.querySelector<HTMLElement>(".thumb")!;
  expect(track.dataset.visible).toBe("true");
  expect(thumb.style.height).toBe("25px");
  vi.useFakeTimers();
  try {
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(800);
    expect(track.dataset.visible).toBe("false");
    hostMessage({ type: "HTNOTE_THEME", vars: { "--ht-reduced-motion": "1" } });
    window.dispatchEvent(new Event("scroll"));
    expect(host.dataset.reducedMotion).toBe("true");
    expect(scrollbarShadow.querySelector("style")?.textContent).toContain(":host([data-reduced-motion=true]) .track{transition:none}");
  } finally {
    document.documentElement.style.removeProperty("--ht-reduced-motion");
    vi.useRealTimers();
  }

  thumb.setPointerCapture = vi.fn();
  const pointer = (type: string, y: number) => {
    const event = new MouseEvent(type, { clientY: y, button: 0 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    thumb.dispatchEvent(event);
  };
  pointer("pointerdown", 10); pointer("pointermove", 35);
  expect(root.scrollTop).toBe(100);
  pointer("pointercancel", 35);
  const author = document.createElement("style"); author.textContent = "html { scrollbar-width: auto; }"; document.head.append(author);
  window.dispatchEvent(new Event("scroll"));
  expect(getComputedStyle(root).scrollbarWidth).toBe("auto");
  expect(track.style.display).toBe("none");
  author.remove();
  delete (document as unknown as { scrollingElement?: Element }).scrollingElement;
  delete (root as unknown as { clientHeight?: number }).clientHeight;
  delete (root as unknown as { scrollHeight?: number }).scrollHeight;
});
