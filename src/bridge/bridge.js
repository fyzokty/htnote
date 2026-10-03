(() => {
  "use strict";

  const { pathname, search } = location;
  const noteId = pathname.split("/")[1];
  const root = document.documentElement;
  const printing = new URLSearchParams(search).get("print") === "1";
  if (printing) {
    root.style.cssText += ";--ht-bg:#f9fafb;--ht-text:#111827;--ht-accent:#4f46e5;--ht-muted:#6b7280;--ht-border:#e5e7eb;--ht-code-bg:#f3f4f6";
    root.dataset.htTheme = "light";
  }
  if (!document.getElementById("htnote-scrollbars")) {
    const s = document.createElement("style");
    s.id = "htnote-scrollbars";
    s.textContent = ":where(*){scrollbar-width:thin;scrollbar-color:var(--ht-scrollbar,var(--ht-border)) transparent}:where(*:hover){scrollbar-color:var(--ht-scrollbar-hover,var(--ht-muted)) transparent}:where(*)::-webkit-scrollbar{width:8px;height:8px}:where(*)::-webkit-scrollbar-track,:where(*)::-webkit-scrollbar-corner{background:transparent}:where(*)::-webkit-scrollbar-thumb{background:var(--ht-scrollbar,var(--ht-border));border:2px solid transparent;border-radius:999px;background-clip:padding-box}:where(*)::-webkit-scrollbar-thumb:hover{background-color:var(--ht-scrollbar-hover,var(--ht-muted))}";
    document.head.prepend(s);
  }
  window.htnote = Object.freeze({ noteId, version: 1 });
  const send = (type, payload = {}) => window.parent.postMessage({ type, ...payload }, "*");
  const external = /^(https?:|mailto:)/i;
  const note = /^htnote:\/\/note\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/?$/i;

  function followLink(e) {
    const a = e.target?.closest?.("a[href]");
    if (!a) return;
    const h = a.getAttribute("href").trim();
    if (h.startsWith("#")) return;
    e.preventDefault();
    const m = note.exec(h);
    if (m) send("HTNOTE_OPEN_NOTE", { id: m[1] });
    else if (external.test(h)) send("HTNOTE_OPEN_EXTERNAL", { url: h });
    else if (/^(\.\/)?assets\//.test(h)) send("HTNOTE_OPEN_ASSET", { relPath: h });
  }
  for (const t of ["click", "auxclick"]) document.addEventListener(t, followLink, true);
  window.open = (u) => {
    if (u != null && external.test(String(u))) send("HTNOTE_OPEN_EXTERNAL", { url: String(u) });
    return null;
  };

  document.addEventListener("keydown", (e) => {
    const { ctrlKey: c, metaKey: m, altKey: a, shiftKey: s, key: k, code } = e;
    if (!(c || m || a || s || k === "Escape")) return;
    const mod = /Mac/i.test(navigator.platform) ? m && !c : c && !m;
    const known = !a && (
      (k === "Escape" && !c && !m && !s) ||
      (code === "Tab" && c && !m) ||
      (mod && (
        (s ? "nfb" : "sewn").includes(k.toLowerCase()) ||
        k === "/" ||
        (!s && /Backslash$/.test(code))
      ))
    );
    if (known) e.preventDefault();
    send("HTNOTE_SHORTCUT", { key: k, ctrl: c, shift: s, alt: a, meta: m });
  }, true);

  function clearHighlights() {
    document.querySelectorAll("mark[data-htnote-hl]").forEach((m) => {
      m.replaceWith(new Text(m.textContent));
      m.parentNode?.normalize();
    });
  }

  function highlight(query) {
    clearHighlights();
    if (typeof query !== "string" || !query) return;
    const needle = query.toLocaleLowerCase("tr");
    const walker = document.createTreeWalker(document.body || root, 4, {
      acceptNode: (n) => n.parentElement?.closest("script,style,mark[data-htnote-hl]") ? 2 : 1,
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
        if (text[offset] === "I" && text[end] === "\u0307") { part = "i"; end++; }
        folded += part;
        while (starts.length < folded.length) { starts.push(offset); ends.push(end); }
        offset = end;
      }
      let from = 0, found = folded.indexOf(needle);
      if (found < 0) continue;
      const frag = document.createDocumentFragment();
      while (found >= 0) {
        const start = starts[found], end = ends[found + needle.length - 1];
        if (start < from) {
          found = folded.indexOf(needle, found + 1);
          continue;
        }
        frag.append(new Text(text.slice(from, start)));
        const mark = document.createElement("mark");
        mark.className = "htnote-highlight";
        mark.dataset.htnoteHl = "";
        mark.textContent = text.slice(start, end);
        frag.append(mark);
        first ||= mark;
        from = end;
        found = folded.indexOf(needle, found + needle.length);
      }
      frag.append(new Text(text.slice(from)));
      node.replaceWith(frag);
    }
    first?.scrollIntoView?.();
  }

  const pad = ";margin:0 auto;padding:2rem ", widths = {
    narrow: "680px" + pad + "1rem",
    comfortable: "860px" + pad + "1.5rem",
    wide: "1200px" + pad + "1.5rem",
    full: "100%;margin:0;padding:1rem 1.5rem",
  };

  function applyContentWidth(w) {
    if (!w || typeof w !== "string") return;
    root.dataset.htContentWidth = w;
    let s = document.getElementById("htnote-content-width");
    if (!s) {
      s = document.createElement("style");
      s.id = "htnote-content-width";
      document.head.append(s);
    }
    const b = document.querySelector('style[data-htnote="base"]');
    if (b) b.textContent = b.textContent.replace(/\bbody\s*\{/g, ":where(body) {");
    s.textContent = `:where(body){max-width:${widths[w] || widths.comfortable}}`;
  }

  let scrolling = false, scrollToken;
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || !e.data || typeof e.data !== "object") return;
    const { type, vars, mode, query, scrollY, token, contentWidth } = e.data;
    if (type === "HTNOTE_THEME" && !printing) {
      if (vars && typeof vars === "object") {
        for (const [k, v] of Object.entries(vars)) if (/^--ht-[\w-]+$/.test(k) && typeof v === "string") root.style.setProperty(k, v);
      }
      if (typeof mode === "string") root.dataset.htTheme = mode;
    } else if (type === "HTNOTE_CONTENT_WIDTH" && !printing) {
      applyContentWidth(contentWidth);
    } else if (type === "HTNOTE_PRINT") {
      window.print();
    } else if (type === "HTNOTE_HIGHLIGHT") {
      highlight(query);
    } else if (type === "HTNOTE_CLEAR_HIGHLIGHT") {
      clearHighlights();
    } else if (type === "HTNOTE_SCROLL_RESTORE" && Number.isFinite(scrollY) && scrollY >= 0) {
      if (typeof token === "string") scrollToken = token;
      window.scrollTo(0, scrollY);
    }
  });

  window.addEventListener("scroll", () => {
    if (scrolling) return;
    scrolling = true;
    requestAnimationFrame(() => {
      scrolling = false;
      send("HTNOTE_SCROLL", { scrollY: window.scrollY, path: pathname, token: scrollToken });
    });
  }, { passive: true });

  const notifyReady = () => send("HTNOTE_READY", { noteId, path: pathname });
  if (document.readyState === "loading") window.addEventListener("load", notifyReady, { once: true });
  else notifyReady();
})();
