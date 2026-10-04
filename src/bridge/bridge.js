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
    s.textContent = ":where(html){background:var(--ht-note-bg,var(--ht-bg));color:var(--ht-text);color-scheme:light dark}:where(*){scrollbar-width:thin;scrollbar-color:var(--ht-scrollbar,var(--ht-border)) transparent}:where(*:hover){scrollbar-color:var(--ht-scrollbar-hover,var(--ht-muted)) transparent}:where(*)::-webkit-scrollbar{width:8px;height:8px}:where(*)::-webkit-scrollbar-track,:where(*)::-webkit-scrollbar-corner{background:transparent}:where(*)::-webkit-scrollbar-thumb{background:var(--ht-scrollbar,var(--ht-border));border:2px solid transparent;border-radius:999px;background-clip:padding-box}:where(*)::-webkit-scrollbar-thumb:hover{background-color:var(--ht-scrollbar-hover,var(--ht-muted))}";
    document.head.prepend(s);
  }
  window.htnote = Object.freeze({ noteId, version: 1 });
  const mediaStyle = document.createElement("style");
  mediaStyle.id = "htnote-media-base";
  mediaStyle.textContent = ":where(video,img){max-width:100%;height:auto}:where(video){max-height:75vh}";
  document.head.append(mediaStyle);
  const audioPlayers = new WeakMap();
  let audioLabels = {};
  const audioTime = (value) => {
    const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };
  const audioCss = `
    :host{display:inline-block;width:28rem;max-width:100%;vertical-align:middle;color-scheme:inherit}
    *{box-sizing:border-box}
    .ht-audio-card{display:flex;align-items:center;gap:10px;width:100%;min-height:56px;padding:7px 10px;border:1px solid var(--ht-audio-border,var(--ht-border));border-radius:12px;background:var(--ht-audio-surface,var(--ht-bg));color:var(--ht-audio-text,var(--ht-text));font:12px/1.3 var(--ht-font,system-ui,sans-serif);position:relative}
    button{display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;border:0;border-radius:50%;width:28px;height:28px;background:transparent;color:inherit;cursor:pointer;transition:background-color 150ms ease-out}
    button:hover{background:var(--ht-audio-hover,var(--ht-code-bg))}
    button:disabled{opacity:.45;cursor:not-allowed}
    button:focus-visible,[role=slider]:focus-visible{outline:2px solid var(--ht-audio-accent,var(--ht-accent));outline-offset:2px}
    .ht-audio-play{width:32px;height:32px;background:var(--ht-audio-accent,var(--ht-accent));color:var(--ht-audio-accent-text,var(--ht-bg))}
    .ht-audio-play:not(:disabled):hover{background:var(--ht-audio-accent-hover,var(--ht-accent))}
    svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .ht-audio-main{min-width:0;flex:1}
    .ht-audio-title{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:500}
    .ht-audio-title small{margin-left:6px;color:var(--ht-audio-muted,var(--ht-muted));font-size:10px}
    .ht-audio-progress{display:flex;align-items:center;gap:2px;height:20px;margin-top:2px;overflow:hidden;cursor:pointer;touch-action:none;border-radius:3px;transition:background-color 150ms ease-out}
    .ht-audio-progress:not([aria-disabled=true]):hover{background:var(--ht-audio-hover,var(--ht-code-bg))}
    .ht-audio-progress[aria-disabled=true]{opacity:.45;cursor:not-allowed}
    .ht-audio-bar{flex:1;min-width:1px;border-radius:2px;background:var(--ht-audio-border,var(--ht-border));transform-origin:center;pointer-events:none}
    .ht-audio-bar[data-played=true]{background:var(--ht-audio-accent,var(--ht-accent))}
    .ht-audio-card[data-playing=true] .ht-audio-bar{animation:ht-audio-pulse 900ms ease-in-out infinite alternate}
    .ht-audio-time{flex-shrink:0;color:var(--ht-audio-muted,var(--ht-muted));font-size:10px;font-variant-numeric:tabular-nums;white-space:nowrap}
    .ht-audio-error{position:absolute;top:100%;left:0;color:var(--ht-audio-danger,var(--ht-text));font-size:11px}
    @keyframes ht-audio-pulse{from{transform:scaleY(.75)}to{transform:scaleY(1)}}
    @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  `;

  function wrapAudio(audio) {
    const host = document.createElement("span");
    host.className = "ht-audio-player";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = audioCss;
    shadow.append(style);
    const make = (tag, className, parent) => {
      const element = document.createElement(tag);
      element.className = className;
      parent.append(element);
      return element;
    };
    const card = make("div", "ht-audio-card", shadow);
    const play = make("button", "ht-audio-play", card);
    play.type = "button";
    const main = make("div", "ht-audio-main", card);
    const title = make("div", "ht-audio-title", main);
    const progress = make("div", "ht-audio-progress", main);
    progress.setAttribute("role", "slider");
    progress.tabIndex = 0;
    const bars = Array.from({ length: 40 }, (_, index) => {
      const bar = make("span", "ht-audio-bar", progress);
      bar.setAttribute("aria-hidden", "true");
      bar.style.animationDelay = `${index * 37}ms`;
      return bar;
    });
    const time = make("span", "ht-audio-time", card);
    const mute = make("button", "ht-audio-mute", card);
    mute.type = "button";
    const error = make("span", "ht-audio-error", card);
    error.setAttribute("role", "status");
    const icon = (button, paths) => {
      button.replaceChildren();
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      for (const d of paths) {
        const path = document.createElementNS(svg.namespaceURI, "path");
        path.setAttribute("d", d);
        svg.append(path);
      }
      button.append(svg);
    };
    let failed = false;
    const duration = () => Number.isFinite(audio.duration) ? audio.duration : 0;
    const update = (event) => {
      if (event?.type === "emptied") failed = false;
      const playing = !audio.paused && !audio.ended;
      const total = duration();
      card.dataset.playing = String(playing);
      const label = audioLabels[playing ? "pause" : "play"] || "";
      play.setAttribute("aria-label", label); play.title = label;
      play.disabled = failed || !!audio.error;
      icon(play, playing ? ["M8 5v14M16 5v14"] : ["m8 5 11 7-11 7Z"]);
      const muteLabel = audioLabels[audio.muted ? "unmute" : "mute"] || "";
      mute.setAttribute("aria-label", muteLabel); mute.title = muteLabel;
      icon(mute, ["m11 5-6 4H2v6h3l6 4Z", audio.muted ? "m16 9 5 6m0-6-5 6" : "M15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14"]);
      let src = audio.getAttribute("src") || audio.querySelector("source")?.getAttribute("src") || "";
      let file = /^(data:|blob:)/.test(src) ? "" : src.split(/[?#]/)[0].split("/").pop() || "";
      try { file = decodeURIComponent(file); } catch { /* Bozuk kodlama dosya adı olarak korunur. */ }
      const name = audio.title || file || audioLabels.title || "";
      title.textContent = name; title.title = name;
      if (audio.title && file) make("small", "", title).textContent = file;
      let seed = 0;
      for (const char of name) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
      bars.forEach((bar, index) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        bar.style.height = `${25 + seed % 76}%`;
        bar.dataset.played = String(total > 0 && index / 40 <= audio.currentTime / total);
      });
      time.textContent = `${audioTime(audio.currentTime)} / ${audioTime(total)}`;
      progress.setAttribute("aria-label", audioLabels.seek || "");
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", String(total));
      progress.setAttribute("aria-valuenow", String(audio.currentTime));
      progress.setAttribute("aria-valuetext", time.textContent);
      progress.setAttribute("aria-disabled", String(!total || play.disabled));
      error.textContent = play.disabled ? audioLabels.error || "" : "";
    };
    const toggle = () => {
      if (play.disabled) return;
      if (audio.paused) void audio.play().catch(() => { failed = true; update(); });
      else audio.pause();
    };
    const seek = (value) => {
      if (!duration() || play.disabled) return;
      audio.currentTime = Math.max(0, Math.min(duration(), value)); update();
    };
    const pointerSeek = (event) => {
      const rect = progress.getBoundingClientRect();
      if (rect.width) seek((event.clientX - rect.left) / rect.width * duration());
    };
    play.addEventListener("click", toggle);
    mute.addEventListener("click", () => { audio.muted = !audio.muted; update(); });
    progress.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !duration() || play.disabled) return;
      event.preventDefault(); progress.focus(); progress.setPointerCapture(event.pointerId); pointerSeek(event);
    });
    progress.addEventListener("pointermove", (event) => { if (progress.hasPointerCapture(event.pointerId)) pointerSeek(event); });
    progress.addEventListener("pointerup", (event) => {
      if (progress.hasPointerCapture(event.pointerId)) { pointerSeek(event); progress.releasePointerCapture(event.pointerId); }
    });
    card.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); event.stopPropagation(); seek(audio.currentTime + (event.key === "ArrowRight" ? 5 : -5));
      } else if (event.key === " " && event.target.tagName !== "BUTTON") {
        event.preventDefault(); event.stopPropagation(); toggle();
      } else if ((event.key === "Home" || event.key === "End") && event.target === progress) {
        event.preventDefault(); event.stopPropagation(); seek(event.key === "Home" ? 0 : duration());
      }
    });
    const events = ["loadedmetadata", "durationchange", "timeupdate", "play", "pause", "ended", "volumechange", "error", "emptied"];
    for (const event of events) audio.addEventListener(event, update);
    const originalHidden = audio.hidden, originalDisplay = audio.style.display;
    audio.hidden = true; audio.style.display = "none";
    audio.before(host);
    const player = { host, update, restore: () => {
      host.remove(); audio.hidden = originalHidden; audio.style.display = originalDisplay;
      for (const event of events) audio.removeEventListener(event, update);
      audioPlayers.delete(audio);
    } };
    audioPlayers.set(audio, player);
    update();
  }

  function enhanceMedia(element) {
    const tokens = new Set((element.getAttribute("controlslist") || "").split(/\s+/).filter(Boolean));
    tokens.add("nodownload");
    element.setAttribute("controlslist", [...tokens].join(" "));
    if (element.tagName !== "AUDIO") return;
    const player = audioPlayers.get(element);
    if (!element.controls || element.hasAttribute("data-ht-native")) { player?.restore(); return; }
    if (player) { if (player.host.nextSibling !== element) element.before(player.host); player.update(); }
    else wrapAudio(element);
  }
  const scanMedia = (node) => {
    if (node.nodeType !== 1) return;
    if (node.matches("source") && node.closest("audio")) enhanceMedia(node.closest("audio"));
    if (node.matches("video,audio")) enhanceMedia(node);
    node.querySelectorAll("video,audio").forEach(enhanceMedia);
  };
  scanMedia(root);
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") scanMedia(record.target);
      else {
        record.addedNodes.forEach(scanMedia);
        if (record.target.tagName === "AUDIO") enhanceMedia(record.target);
        record.removedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          const removed = node.matches("audio") ? [node] : node.querySelectorAll("audio");
          for (const audio of removed) if (!audio.isConnected) audioPlayers.get(audio)?.restore();
        });
      }
    }
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["controls", "data-ht-native", "src", "title"] });
  document.addEventListener("contextmenu", (event) => {
    if (event.target?.closest?.("video")) event.preventDefault();
  }, true);
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
        k === "/" || (!s && k === ",") ||
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
    const { type, vars, mode, query, scrollY, token, contentWidth, audioLabels: labels } = e.data;
    if (type === "HTNOTE_THEME" && labels && typeof labels === "object") {
      for (const key of ["play", "pause", "mute", "unmute", "seek", "title", "error"]) {
        if (typeof labels[key] === "string" && labels[key].length <= 200) audioLabels[key] = labels[key];
      }
      document.querySelectorAll("audio").forEach((audio) => audioPlayers.get(audio)?.update());
    }
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
