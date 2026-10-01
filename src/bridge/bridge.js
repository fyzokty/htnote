(() => {
  "use strict";

  const noteId = location.pathname.split("/")[1];
  window.htnote = Object.freeze({ noteId, version: 1 });
  const send = (type, payload = {}) => window.parent.postMessage({ type, ...payload }, "*");
  const external = /^(https?:|mailto:)/i;
  const note = /^htnote:\/\/note\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
  function followLink(event) {
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href").trim();
    if (href.startsWith("#")) return;
    event.preventDefault();
    const match = note.exec(href);
    if (match) send("HTNOTE_OPEN_NOTE", { id: match[1] });
    else if (external.test(href)) send("HTNOTE_OPEN_EXTERNAL", { url: href });
  }
  document.addEventListener("click", followLink, true);
  document.addEventListener("auxclick", followLink, true);
  window.open = (url) => {
    if (url != null && external.test(String(url))) send("HTNOTE_OPEN_EXTERNAL", { url: String(url) });
    return null;
  };

  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.key === "Escape")) return;
    const key = event.key.toLowerCase();
    const mod = /Mac/i.test(navigator.platform)
      ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    const known = !event.altKey && (
      (event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.shiftKey) ||
      (event.code === "Tab" && (mod || event.ctrlKey && !event.metaKey)) ||
      (mod && (
        (event.shiftKey ? ["n", "f"] : ["s", "e", "w", "n"]).includes(key) ||
        (!event.shiftKey && ["Backslash", "IntlBackslash"].includes(event.code))
      ))
    );
    if (known) event.preventDefault();
    send("HTNOTE_SHORTCUT", {
      key: event.key, ctrl: event.ctrlKey, shift: event.shiftKey,
      alt: event.altKey, meta: event.metaKey,
    });
  }, true);

  function clearHighlights() {
    document.querySelectorAll("mark[data-htnote-hl]").forEach((mark) => {
      const parent = mark.parentNode;
      mark.replaceWith(document.createTextNode(mark.textContent));
      parent.normalize();
    });
  }

  function highlight(query) {
    clearHighlights();
    if (typeof query !== "string" || !query) return;
    const needle = query.toLocaleLowerCase("tr");
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement && !node.parentElement.closest("script, style, mark[data-htnote-hl]")
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let first;
    for (const node of nodes) {
      const text = node.textContent;
      let folded = "";
      const starts = [], ends = [];
      for (let offset = 0; offset < text.length;) {
        let end = offset + (text.codePointAt(offset) > 0xffff ? 2 : 1);
        let part = text.slice(offset, end).toLocaleLowerCase("tr");
        if (text[offset] === "I" && text[end] === "\u0307") {
          part = "i";
          end++;
        }
        folded += part;
        for (let i = 0; i < part.length; i++) { starts.push(offset); ends.push(end); }
        offset = end;
      }
      let from = 0;
      let found = folded.indexOf(needle);
      if (found < 0) continue;
      const fragment = document.createDocumentFragment();
      while (found >= 0) {
        const start = starts[found];
        const end = ends[found + needle.length - 1];
        if (start < from) {
          found = folded.indexOf(needle, found + 1);
          continue;
        }
        fragment.append(document.createTextNode(text.slice(from, start)));
        const mark = document.createElement("mark");
        mark.setAttribute("data-htnote-hl", "");
        mark.textContent = text.slice(start, end);
        fragment.append(mark);
        first ||= mark;
        from = end;
        found = folded.indexOf(needle, found + needle.length);
      }
      fragment.append(document.createTextNode(text.slice(from)));
      node.replaceWith(fragment);
    }
    first?.scrollIntoView?.();
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
    const { type, vars, mode, query, scrollY } = event.data;
    if (type === "HTNOTE_THEME") {
      if (vars && typeof vars === "object") {
        for (const [name, value] of Object.entries(vars)) {
          if (/^--ht-[\w-]+$/.test(name) && typeof value === "string") {
            document.documentElement.style.setProperty(name, value);
          }
        }
      }
      if (typeof mode === "string") document.documentElement.setAttribute("data-ht-theme", mode);
    } else if (type === "HTNOTE_HIGHLIGHT") highlight(query);
    else if (type === "HTNOTE_SCROLL_RESTORE" && Number.isFinite(scrollY) && scrollY >= 0) window.scrollTo(0, scrollY);
  });

  let scrolling = false;
  window.addEventListener("scroll", () => {
    if (scrolling) return;
    scrolling = true;
    requestAnimationFrame(() => { scrolling = false; send("HTNOTE_SCROLL", { scrollY: window.scrollY, path: location.pathname }); });
  }, { passive: true });

  if (document.readyState === "loading") window.addEventListener("load", () => send("HTNOTE_READY", { noteId, path: location.pathname }), { once: true });
  else send("HTNOTE_READY", { noteId, path: location.pathname });
})();
