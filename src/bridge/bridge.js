(() => {
  "use strict";
  // Not script'leri sonradan global adları değiştirse de motorlar yerel kalır.
  const templateEngine = globalThis.HTNOTE_TEMPLATE_ENGINE;
  const calcEngine = globalThis.HTNOTE_CALC_ENGINE;
  const ipEngine = globalThis.HTNOTE_IP_ENGINE;
  delete globalThis.HTNOTE_TEMPLATE_ENGINE;
  delete globalThis.HTNOTE_CALC_ENGINE;
  delete globalThis.HTNOTE_IP_ENGINE;

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
    s.textContent = ":where(html){background:var(--ht-note-bg,var(--ht-bg));color:var(--ht-text);font-family:var(--ht-font,system-ui,-apple-system,sans-serif);color-scheme:light dark}:where(*:not(html)){scrollbar-width:thin;scrollbar-color:var(--ht-scrollbar,var(--ht-border)) transparent}:where(*:hover){scrollbar-color:var(--ht-scrollbar-hover,var(--ht-muted)) transparent}:where(*)::-webkit-scrollbar{width:8px;height:8px}:where(*)::-webkit-scrollbar-track,:where(*)::-webkit-scrollbar-corner{background:transparent}:where(*)::-webkit-scrollbar-thumb{background:var(--ht-scrollbar,var(--ht-border));border:2px solid transparent;border-radius:999px;background-clip:padding-box}:where(*)::-webkit-scrollbar-thumb:hover{background-color:var(--ht-scrollbar-hover,var(--ht-muted))}:where(html){scrollbar-width:none}:where(html)::-webkit-scrollbar{width:0;height:0}";
    document.head.prepend(s);
  }
  // Kök çubuk tek host ve kapalı shadow root içinde yer kaplamadan çizilir.
  if (!printing && !document.querySelector("[data-htnote-scrollbars]")) {
    const host = document.createElement("div");
    host.dataset.htnoteScrollbars = "true";
    host.setAttribute("aria-hidden", "true");
    for (const [key, value] of Object.entries({ all: "initial", position: "fixed", inset: "0", width: "auto", height: "auto", margin: "0", padding: "0", border: "0", transform: "none", opacity: "1", visibility: "visible", zIndex: "2147483647", pointerEvents: "none" })) {
      host.style.setProperty(key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), value, "important");
    }
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host{display:block} .track{position:absolute;pointer-events:none;opacity:0;transition:opacity var(--ht-motion-duration,180ms) var(--ht-motion-easing,ease-out)}
      .track[data-visible=true]{opacity:1} .vertical{right:0;top:0;width:10px;height:100%} .horizontal{bottom:0;left:0;height:10px;width:100%}
      .thumb{position:absolute;pointer-events:auto;touch-action:none;border-radius:999px;background:var(--ht-scrollbar,var(--ht-border));cursor:default}
      .vertical .thumb{right:1px;width:5px} .horizontal .thumb{bottom:1px;height:5px}
      .thumb:hover,.thumb[data-dragging=true]{background:var(--ht-scrollbar-hover,var(--ht-muted))}
      .vertical .thumb:hover,.vertical .thumb[data-dragging=true]{width:8px} .horizontal .thumb:hover,.horizontal .thumb[data-dragging=true]{height:8px}
      :host([data-reduced-motion=true]) .track{transition:none}
      @media print{:host{display:none!important}}
    `;
    shadow.append(style);
    root.append(host);
    let active = false, hover = false, dragging = false, timer, frame = 0;
    const tracks = [true, false].map((vertical) => {
      const track = document.createElement("div"), thumb = document.createElement("div");
      track.className = `track ${vertical ? "vertical" : "horizontal"}`;
      thumb.className = "thumb"; track.append(thumb); shadow.append(track);
      let drag;
      thumb.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const scroller = document.scrollingElement || root;
        const viewport = vertical ? scroller.clientHeight : scroller.clientWidth;
        const content = vertical ? scroller.scrollHeight : scroller.scrollWidth;
        const length = Math.min(viewport, Math.max(24, viewport * viewport / Math.max(content, 1)));
        drag = { pointer: event.pointerId, point: vertical ? event.clientY : event.clientX, start: vertical ? scroller.scrollTop : scroller.scrollLeft, range: Math.max(0, content - viewport), travel: Math.max(0, viewport - length) };
        event.preventDefault(); thumb.setPointerCapture(event.pointerId); dragging = true; thumb.dataset.dragging = "true"; update();
      });
      thumb.addEventListener("pointermove", (event) => {
        if (!drag || event.pointerId !== drag.pointer) return;
        const delta = (vertical ? event.clientY : event.clientX) - drag.point;
        const value = Math.max(0, Math.min(drag.range, drag.start + (drag.travel ? delta * drag.range / drag.travel : 0)));
        const scroller = document.scrollingElement || root;
        if (vertical) scroller.scrollTop = value; else scroller.scrollLeft = value;
        update();
      });
      const end = () => { drag = null; dragging = false; thumb.dataset.dragging = "false"; update(); };
      thumb.addEventListener("pointerup", (event) => { if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId); end(); });
      thumb.addEventListener("lostpointercapture", end); thumb.addEventListener("pointercancel", end);
      thumb.addEventListener("pointerenter", () => { hover = true; update(); });
      thumb.addEventListener("pointerleave", () => { hover = false; update(); });
      return { track, thumb, vertical };
    });
    function update() {
      const scroller = document.scrollingElement || root;
      const reducedMotion = root.style.getPropertyValue("--ht-reduced-motion").trim() || (root.dataset.htReducedMotion === "true" ? "1" : root.dataset.htReducedMotion === "false" ? "0" : "");
      host.dataset.reducedMotion = String(reducedMotion ? reducedMotion === "1" : !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
      tracks.forEach(({ track, thumb, vertical }) => {
        const viewport = vertical ? scroller.clientHeight : scroller.clientWidth;
        const content = vertical ? scroller.scrollHeight : scroller.scrollWidth;
        const position = vertical ? scroller.scrollTop : scroller.scrollLeft;
        const length = Math.min(viewport, Math.max(24, viewport * viewport / Math.max(content, 1)));
        const range = Math.max(0, content - viewport), travel = Math.max(0, viewport - length);
        const offset = range ? Math.max(0, Math.min(range, position)) / range * travel : 0;
        // Yazarın açık yerel çubuk tercihi düşük özgüllüklü varsayılanı geçersiz kılar.
        track.style.display = range > 1 && getComputedStyle(root).scrollbarWidth === "none" ? "block" : "none";
        track.dataset.visible = String(active || hover || dragging);
        if (vertical) Object.assign(thumb.style, { top: `${offset}px`, height: `${length}px` });
        else Object.assign(thumb.style, { left: `${offset}px`, width: `${length}px` });
      });
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); };
    window.addEventListener("scroll", () => { active = true; clearTimeout(timer); timer = setTimeout(() => { active = false; update(); }, 800); update(); }, { passive: true });
    window.addEventListener("pointermove", (event) => { hover = event.clientX >= innerWidth - 10 || event.clientY >= innerHeight - 10; schedule(); }, { passive: true });
    document.addEventListener("pointerleave", () => { hover = false; update(); });
    window.addEventListener("resize", schedule); window.addEventListener("load", schedule); window.addEventListener("message", schedule);
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(schedule).observe(root);
    new MutationObserver(schedule).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
    update();
  }
  window.htnote = Object.freeze({ noteId, version: 1 });
  const mediaStyle = document.createElement("style");
  mediaStyle.id = "htnote-media-base";
  mediaStyle.textContent = ":where(video,img){max-width:100%;height:auto}:where(video){max-height:75vh}";
  document.head.append(mediaStyle);
  const paragraphStyle = document.createElement("style");
  paragraphStyle.id = "htnote-paragraph-base";
  paragraphStyle.textContent = ":where(#htnote-content p){margin:0.3em 0;min-height:1lh}";
  document.head.append(paragraphStyle);
  const boxStyle = document.createElement("style");
  boxStyle.id = "htnote-textbox-base";
  boxStyle.textContent = `
  :where(html){--ht-widget-surface:#ffffff;--ht-widget-text:#0d1c2e;--ht-widget-accent:#4648d4;--ht-widget-border:#7b8598;--ht-widget-divider:#e0e3ee;--ht-widget-muted:#464554;--ht-widget-field:#f8f9ff;--ht-widget-hover:#e6eeff;--ht-widget-danger:#ba1a1a;--ht-note-sepia:#faf3e5;--ht-note-mint:#eaf5ee;--ht-note-rose:#faedf1;--ht-note-sky:#edf4fc;--ht-note-lavender:#f2eefb;--ht-note-charcoal:#e9edf2;}
  @media(prefers-color-scheme:dark){:where(html:not([data-ht-theme])){--ht-widget-shadow:0 10px 25px -4px #00000040,0 4px 10px -2px #00000026;--ht-widget-surface:#101623;--ht-widget-text:#f1f5f9;--ht-widget-accent:#a5a6ff;--ht-widget-border:#78849b;--ht-widget-divider:#303647;--ht-widget-muted:#a8b6cc;--ht-widget-field:#0d1220;--ht-widget-hover:#222c40;--ht-widget-danger:#fb929e;--ht-note-sepia:#302b23;--ht-note-mint:#23352b;--ht-note-rose:#35252d;--ht-note-sky:#243043;--ht-note-lavender:#2e2940;--ht-note-charcoal:#171d25;}}
  :where(html[data-ht-theme="dark"]){--ht-widget-shadow:0 10px 25px -4px #00000040,0 4px 10px -2px #00000026;--ht-widget-surface:#101623;--ht-widget-text:#f1f5f9;--ht-widget-accent:#a5a6ff;--ht-widget-border:#78849b;--ht-widget-divider:#303647;--ht-widget-muted:#a8b6cc;--ht-widget-field:#0d1220;--ht-widget-hover:#222c40;--ht-widget-danger:#fb929e;--ht-note-sepia:#302b23;--ht-note-mint:#23352b;--ht-note-rose:#35252d;--ht-note-sky:#243043;--ht-note-lavender:#2e2940;--ht-note-charcoal:#171d25;}

/* Dar ekranda taşınabilir inline grid yalnız burada ezilir; yazdırmada ızgara korunur. */
:where(.htnote-board-cell){min-width:0}
:where(.htnote-board-cell > :first-child){margin-top:0}
:where(.htnote-board-cell > :last-child){margin-bottom:0}
@media screen and (max-width:560px){:where(.htnote-board){display:block!important}:where(.htnote-board-cell + .htnote-board-cell){margin-top:16px}}
:where(.htnote-textbox){position:relative;box-sizing:border-box;margin:1em 0;padding:20px;border:1px solid var(--ht-widget-divider,#e0e3ee);border-radius:16px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-surface,#ffffff);box-shadow:var(--ht-widget-shadow,0 10px 25px -4px #4755690f,0 4px 10px -2px #6366f10a);font-family:var(--ht-font,system-ui,sans-serif)}
:where(.htnote-textbox-input){box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--ht-widget-border,#7b8598);border-radius:8px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-field,#f8f9ff)}
:where(.htnote-textbox-title){font:600 18px/1.4 var(--ht-font,system-ui,sans-serif);min-height:1lh;margin-bottom:8px;white-space:pre-wrap;overflow-wrap:anywhere}
:where(.htnote-textbox-input){display:block;min-height:4.8em;field-sizing:content;resize:vertical;font:15px/1.6 var(--ht-font,system-ui,sans-serif);overflow-y:hidden}
:where(.htnote-textbox-input:focus-visible){outline:2px solid var(--ht-widget-accent,#4648d4);outline-offset:2px}

  :where(.htnote-widget-header){display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--ht-widget-divider);font-family:var(--ht-font,system-ui,sans-serif)}
  :where(.htnote-widget-heading){display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}
  :where(.htnote-widget-heading > div){margin:0}
  :where(.htnote-widget-type){display:inline-flex;align-items:center;gap:6px;min-width:0;color:var(--ht-widget-muted,#464554);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
  :where(.htnote-widget-type svg){width:14px;height:14px;flex-shrink:0;color:var(--ht-widget-accent,#4648d4)}
  :where(.htnote-widget-actions){display:flex;flex-shrink:0;flex-wrap:wrap;gap:4px;font:12px/1.4 var(--ht-font,system-ui,sans-serif)}
  :where(.htnote-widget-actions button){border:1px solid color-mix(in srgb,var(--ht-widget-divider,#e0e3ee) 85%,var(--ht-widget-muted,#464554));border-radius:8px;padding:6px 8px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-surface,#ffffff);cursor:pointer}
  :where(.htnote-widget-actions button:focus-visible){outline:2px solid var(--ht-widget-accent,#4648d4);outline-offset:2px}
  :where(.htnote-widget-actions button[data-feedback="copied"]){color:var(--ht-widget-accent,#4648d4)}
:where(.htnote-checklist){box-sizing:border-box;margin:1em 0;padding:20px;border:1px solid var(--ht-widget-divider,#e0e3ee);border-radius:16px;color:var(--ht-widget-text);background:var(--ht-widget-surface);box-shadow:var(--ht-widget-shadow,0 10px 25px -4px #4755690f,0 4px 10px -2px #6366f10a);font-family:var(--ht-font,system-ui,sans-serif)}
:where(.htnote-checklist-title){font:600 18px/1.4 var(--ht-font,system-ui,sans-serif);min-height:1lh;margin-bottom:8px;white-space:pre-wrap;overflow-wrap:anywhere}
:where(.htnote-checklist-items){list-style:none;margin:0;padding:0}
:where(.htnote-checklist-items li){padding:10px 0;border-top:1px solid var(--ht-widget-divider);overflow-wrap:anywhere}
:where(.htnote-checklist-items label){cursor:pointer;font-size:15px;transition:color calc(180ms * (1 - var(--ht-reduced-motion,0))) ease-out,text-decoration-color calc(180ms * (1 - var(--ht-reduced-motion,0))) ease-out;text-decoration:line-through;text-decoration-color:transparent}
:where(.htnote-checklist-items input){appearance:auto;width:16px;height:16px;vertical-align:middle;border-radius:4px;accent-color:var(--ht-widget-accent)}
:where(.htnote-checklist-items input:focus-visible){outline:2px solid var(--ht-widget-accent);outline-offset:2px}
  :where(.htnote-checklist-summary){padding:0 0 14px;color:var(--ht-widget-accent);font-size:12px}
  :where(.htnote-checklist-summary > span){display:block;text-align:right;margin-bottom:6px}
  :where(.htnote-checklist-progress){height:6px;border:0;border-radius:999px;background:var(--ht-widget-divider);overflow:hidden}
  :where(.htnote-checklist-progress > div){height:100%;border-radius:inherit;background:var(--ht-widget-accent);transition:width calc(300ms * (1 - var(--ht-reduced-motion,0))) ease-out}
  :where(.htnote-checklist-done){color:color-mix(in srgb,var(--ht-widget-muted) 75%,transparent);text-decoration-color:currentColor}

:where(.htnote-copyfields){box-sizing:border-box;margin:1em 0;padding:20px;border:1px solid var(--ht-widget-divider,#e0e3ee);border-radius:16px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-surface,#ffffff);box-shadow:var(--ht-widget-shadow,0 10px 25px -4px #4755690f,0 4px 10px -2px #6366f10a);font-family:var(--ht-font,system-ui,sans-serif)}
:where(.htnote-copyfields-title){font:600 18px/1.4 var(--ht-font,system-ui,sans-serif);min-height:1lh;margin-bottom:8px;white-space:pre-wrap;overflow-wrap:anywhere}
:where(.htnote-copyfields-list){margin:0;padding:0}
:where(.htnote-copyfields-row){display:grid;grid-template-columns:minmax(0,120px) minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 12px;margin-bottom:8px;border:1px solid var(--ht-widget-row-border,var(--ht-widget-divider,#e0e3ee));border-radius:8px;background:color-mix(in srgb,var(--ht-widget-surface,#ffffff) 65%,transparent)}
:where(.htnote-copyfields-row dt){font-size:14px;font-weight:500;overflow-wrap:anywhere}
:where(.htnote-copyfields-row dd){min-width:0;margin:0;padding:4px 8px;border:1px solid var(--ht-widget-divider,#e0e3ee);justify-self:start;max-width:100%;box-sizing:border-box;border-radius:8px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-field,#f8f9ff);font:14px/1.6 "Cascadia Code","Cascadia Mono",Consolas,ui-monospace,SFMono-Regular,monospace;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}
  :where(.htnote-copyfields-copy){display:inline-flex;align-items:center;gap:6px;border:1px solid color-mix(in srgb,var(--ht-widget-divider) 85%,var(--ht-widget-muted));border-radius:8px;padding:6px;color:var(--ht-widget-text);background:var(--ht-widget-surface);cursor:pointer}
  :where(.htnote-copyfields-copy svg){width:15px;height:15px;flex-shrink:0}
  :where(.htnote-copyfields-copy:focus-visible){outline:2px solid var(--ht-widget-accent);outline-offset:2px}
  :where(.htnote-copyfields-copy[data-feedback="copied"]){color:var(--ht-widget-accent)}
  /* Eski not stilleri bridge'den sonra gelir; dar düzen kuralları :where dışına alınarak özgüllükle korunur. */
  @media(max-width:480px){.htnote-copyfields-row{grid-template-columns:minmax(0,1fr) auto}.htnote-copyfields-row>dt{grid-column:1/-1}}

:where(.htnote-template){container-type:inline-size;box-sizing:border-box;margin:1em 0;padding:20px;border:1px solid var(--ht-widget-divider,#e0e3ee);border-radius:16px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-surface,#ffffff);box-shadow:var(--ht-widget-shadow,0 10px 25px -4px #4755690f,0 4px 10px -2px #6366f10a);font-family:var(--ht-font,system-ui,sans-serif)}
:where(.htnote-template-title){font:600 18px/1.4 var(--ht-font,system-ui,sans-serif);min-height:1lh;margin-bottom:8px;white-space:pre-wrap;overflow-wrap:anywhere}
:where(.htnote-template-source){display:block;box-sizing:border-box;width:100%;min-height:4.8em;padding:8px;border:1px solid var(--ht-widget-border,#7b8598);border-radius:8px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-field,#f8f9ff);field-sizing:content;resize:vertical;font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace}
:where(.htnote-template-source:focus-visible){outline:2px solid var(--ht-widget-accent,#4648d4);outline-offset:2px}

  .htnote-template-source[hidden],.htnote-template-fields[hidden]{display:none!important}
  :where(.htnote-template-layout){display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:16px}
  :where(.htnote-template-layout:has(.htnote-template-fields[hidden])){grid-template-columns:minmax(0,1fr)}
  :where(.htnote-template-fields){display:flex;flex-direction:column;gap:12px;min-width:0}
  :where(.htnote-template-fields label){display:block;margin-bottom:4px;color:var(--ht-widget-muted);font:12px/1.4 var(--ht-font,system-ui,sans-serif);overflow-wrap:anywhere}
  :where(.htnote-template-fields input){box-sizing:border-box;width:100%;min-width:0;padding:8px;border:1px solid var(--ht-widget-border);border-radius:8px;background:var(--ht-widget-field);color:var(--ht-widget-text);font:13px/1.6 var(--ht-font,system-ui,sans-serif)}
  :where(.htnote-template-fields input:focus-visible){outline:2px solid var(--ht-widget-accent);outline-offset:2px}
  :where(.htnote-template-panel){min-width:0;padding:12px;border:1px solid var(--ht-widget-border);border-radius:8px;background:var(--ht-widget-field)}
  :where(.htnote-template-preview-heading){display:block;padding-bottom:8px;margin-bottom:8px;border-bottom:1px solid var(--ht-widget-divider);color:var(--ht-widget-muted);font:12px/1.4 var(--ht-font,system-ui,sans-serif)}
  :where(.htnote-template-preview){white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace}
  :where(.htnote-template-value){border-radius:4px;color:var(--ht-widget-accent);background:color-mix(in srgb,var(--ht-widget-accent) 15%,transparent);box-decoration-break:clone;padding:1px 3px}
  :where(.htnote-template-placeholder){border:1px dashed var(--ht-widget-border);border-radius:4px;color:var(--ht-widget-muted);padding:1px 3px}
  :where(.htnote-widget-actions .htnote-template-copy){border-color:color-mix(in srgb,var(--ht-widget-accent) 30%,var(--ht-widget-divider));color:var(--ht-widget-accent);background:color-mix(in srgb,var(--ht-widget-accent) 12%,var(--ht-widget-surface))}
  @container(max-width:600px){:where(.htnote-template-layout){grid-template-columns:minmax(0,1fr)}}
  @media(max-width:600px){:where(.htnote-template-layout){grid-template-columns:minmax(0,1fr)}}
  @media print{.htnote-template .htnote-widget-header,.htnote-template-title,.htnote-template-source,.htnote-template-fields,.htnote-template-preview-heading{display:none!important}.htnote-template-layout{display:block!important}.htnote-template-panel{border:0!important;padding:0!important;background:transparent!important}}
  ${printing ? ".htnote-template .htnote-widget-header,.htnote-template-title,.htnote-template-source,.htnote-template-fields,.htnote-template-preview-heading{display:none!important}.htnote-template-layout{display:block!important}.htnote-template-panel{border:0!important;padding:0!important;background:transparent!important}" : ""}


:where(.htnote-ipblock){container-type:inline-size;container-name:widget;box-sizing:border-box;margin:1em 0;padding:20px;border:1px solid var(--ht-widget-divider,#e0e3ee);border-radius:16px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-surface,#ffffff);box-shadow:var(--ht-widget-shadow,0 10px 25px -4px #4755690f,0 4px 10px -2px #6366f10a);font-family:var(--ht-font,system-ui,sans-serif)}
:where(.htnote-ipblock-title){font:600 18px/1.4 var(--ht-font,system-ui,sans-serif);min-height:1lh;margin-bottom:8px;white-space:pre-wrap;overflow-wrap:anywhere}
:where(.htnote-ipblock-list,.htnote-ipblock-list-snapshot){box-sizing:border-box;margin:12px 0 0;padding:12px;border:1px solid var(--ht-widget-divider,#e0e3ee);border-radius:8px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-field,#f8f9ff);font:14px/1.6 "Cascadia Code","Cascadia Mono",Consolas,ui-monospace,SFMono-Regular,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:16em;overflow:auto;user-select:text}
:where(.htnote-ipblock-fields){display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
:where(.htnote-ipblock-fields label){display:flex;flex-direction:column;gap:6px;min-width:0;font-size:14px;font-weight:500}
:where(.htnote-ipblock-fields input,.htnote-ipblock-fields select){box-sizing:border-box;min-width:0;width:100%;height:36px;padding:0 12px;border:1px solid var(--ht-widget-border,#7b8598);border-radius:8px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-field,#f8f9ff);font:14px/normal "Cascadia Code","Cascadia Mono",Consolas,ui-monospace,SFMono-Regular,monospace}
:where(.htnote-ipblock-fields input:focus-visible,.htnote-ipblock-fields select:focus-visible,.htnote-ipblock-list:focus-visible){outline:2px solid var(--ht-widget-accent,#4648d4);outline-offset:2px}
:where(.htnote-ipblock-fields input[aria-invalid="true"]){border-color:var(--ht-widget-danger,#ba1a1a)}
:where(.htnote-ipblock-error){color:var(--ht-widget-danger,#ba1a1a);font-size:13px;margin:8px 0}
:where(.htnote-ipblock-summary){color:var(--ht-widget-muted,#586174);font-size:13px;margin:12px 0}
:where(.htnote-ipblock-empty,.htnote-ipblock-empty-snapshot){box-sizing:border-box;margin:12px 0 0;padding:24px 16px;border:1px solid var(--ht-widget-divider,#e0e3ee);border-radius:8px;background:var(--ht-widget-field,#f8f9ff);color:var(--ht-widget-muted,#586174);font-size:13px;line-height:1.5;text-align:center}
.htnote-ipblock-print{display:none}
@container widget (max-width:360px){.htnote-ipblock-fields{grid-template-columns:minmax(0,1fr)}}
@media(max-width:480px){.htnote-ipblock-fields{grid-template-columns:minmax(0,1fr)}}
@media print{.htnote-ipblock .htnote-widget-actions,.htnote-ipblock-fields,.htnote-ipblock-empty{display:none!important}.htnote-ipblock-print{display:block!important}.htnote-ipblock-list{max-height:none!important;overflow:visible!important}}
  ${printing ? ".htnote-ipblock .htnote-widget-actions,.htnote-ipblock-fields,.htnote-ipblock-empty{display:none!important}.htnote-ipblock-print{display:block!important}.htnote-ipblock-list{max-height:none!important;overflow:visible!important}" : ""}
:where(.htnote-calc){container-type:inline-size;container-name:widget;box-sizing:border-box;margin:1em 0;padding:20px;border:1px solid var(--ht-widget-divider,#e0e3ee);border-radius:16px;color:var(--ht-widget-text);background:var(--ht-widget-surface);box-shadow:var(--ht-widget-shadow,0 10px 25px -4px #4755690f,0 4px 10px -2px #6366f10a);font-family:var(--ht-font,system-ui,sans-serif)}
:where(.htnote-calc-title){font:600 18px/1.4 var(--ht-font,system-ui,sans-serif);min-height:1lh;margin-bottom:8px;white-space:pre-wrap;overflow-wrap:anywhere}
:where(.htnote-calc-lines){display:grid;grid-template-columns:minmax(0,1fr) 12ch;border:1px solid var(--ht-widget-border);border-radius:8px;background:var(--ht-widget-field);overflow:hidden}
:where(.htnote-calc-input){display:block;box-sizing:border-box;width:100%;min-width:0;min-height:4.8em;padding:8px;border:0;border-radius:0;color:var(--ht-widget-text);background:var(--ht-widget-field);field-sizing:fixed;resize:none;white-space:pre;overflow-x:auto;font:13px/21px ui-monospace,SFMono-Regular,Consolas,monospace}
:where(.htnote-calc-input:focus-visible){outline:2px solid var(--ht-widget-accent);outline-offset:-2px}
:where(.htnote-calc-results){padding:8px;border-left:1px solid var(--ht-widget-divider);overflow:hidden;text-align:right;font:13px/21px ui-monospace,SFMono-Regular,Consolas,monospace}
:where(.htnote-calc-results>div){height:21px;white-space:nowrap}
:where(.htnote-calc-error){color:var(--ht-widget-muted)}
:where(.htnote-calc-total){display:flex;justify-content:space-between;gap:12px;margin-top:16px;padding:12px;border:1px solid color-mix(in srgb,var(--ht-widget-accent) 30%,var(--ht-widget-divider));border-radius:8px;background:color-mix(in srgb,var(--ht-widget-accent) 8%,var(--ht-widget-surface))}
:where(.htnote-calc-total strong:last-child){color:var(--ht-widget-accent);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
:where([data-htnote-widget]){min-width:0;max-width:100%;overflow-wrap:anywhere}
:where(.htnote-textbox-input,.htnote-template-source){min-width:0}
:where(.htnote-copyfields){container-type:inline-size;container-name:widget}
:where(.htnote-calc-total){flex-wrap:wrap}
@container widget (max-width:360px){
  :where(.htnote-calc-lines){grid-template-columns:minmax(0,1fr)}
  :where(.htnote-calc-input){white-space:pre-wrap;overflow-wrap:anywhere;overflow-x:hidden;field-sizing:content;height:auto!important}
  :where(.htnote-calc-results){border-left:0;border-top:1px solid var(--ht-widget-divider)}
  :where(.htnote-calc-results>div){height:auto;min-height:21px;white-space:pre-wrap;overflow-wrap:anywhere}
  /* Eski not stilleri bridge'den sonra gelir; dar düzen kuralları :where dışına alınarak özgüllükle korunur. */
  .htnote-copyfields-row{grid-template-columns:minmax(0,1fr) auto}
  .htnote-copyfields-row>dt{grid-column:1/-1}
}
.htnote-calc-print{display:none;font:13px/21px ui-monospace,SFMono-Regular,Consolas,monospace}
.htnote-calc-print>div{display:grid;grid-template-columns:minmax(0,1fr) 12ch;gap:8px;break-inside:avoid}
.htnote-calc-print pre{min-width:0;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
.htnote-calc-print span{text-align:right;white-space:pre-wrap;overflow-wrap:anywhere}
@media print{.htnote-calc-lines{display:none!important}.htnote-calc-print{display:block!important}}
${printing ? ".htnote-calc-lines{display:none!important}.htnote-calc-print{display:block!important}" : ""}
  :where(.htnote-textbox-print){display:none;white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.6 var(--ht-font,system-ui,sans-serif);margin:0}
  :where(.htnote-widget-actions button,.htnote-copyfields-copy){position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;min-height:30px;font:12px/1.4 var(--ht-font,system-ui,sans-serif);transition:background-color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,border-color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,transform calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out}
  :where(.htnote-widget-actions button:not(:disabled):hover,.htnote-copyfields-copy:not(:disabled):hover){background:var(--ht-widget-hover);border-color:var(--ht-widget-accent);color:var(--ht-widget-accent)}
  :where(.htnote-widget-actions button:not(:disabled):active,.htnote-copyfields-copy:not(:disabled):active){transform:scale(.97)}
  :where(.htnote-widget-actions button:disabled,.htnote-copyfields-copy:disabled){opacity:.5;cursor:default}
  :where(.htnote-widget-actions button > svg){width:15px;height:15px;flex-shrink:0}
  :where(.htnote-copyfields-copy > .htnote-widget-label){display:none}
  :where(.htnote-widget-copy-icons){display:grid;width:15px;height:15px;flex-shrink:0}
  :where(.htnote-widget-copy-icons svg){grid-area:1/1;width:15px;height:15px;transition:opacity calc(180ms * (1 - var(--ht-reduced-motion,0))) ease-out,transform calc(180ms * (1 - var(--ht-reduced-motion,0))) ease-out}
  :where(.htnote-widget-copy-icons svg:last-child){opacity:0;transform:scale(.8)}
  :where([data-feedback="copied"] > .htnote-widget-copy-icons svg:first-child){opacity:0;transform:scale(.8)}
  :where([data-feedback="copied"] > .htnote-widget-copy-icons svg:last-child){opacity:1;transform:scale(1)}
  :where(.htnote-widget-feedback){position:absolute;z-index:1;right:calc(100% + 6px);top:50%;display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid var(--ht-widget-divider);border-radius:999px;background:var(--ht-widget-surface);color:var(--ht-widget-accent);white-space:nowrap;pointer-events:none;opacity:0;transform:translate(4px,-50%) scale(.96);transition:opacity calc(180ms * (1 - var(--ht-reduced-motion,0))) ease-out,transform calc(180ms * (1 - var(--ht-reduced-motion,0))) ease-out}
  :where(.htnote-widget-feedback svg){width:13px;height:13px;flex-shrink:0}
  :where([data-feedback="copied"] > .htnote-widget-feedback,[data-feedback="copyFailed"] > .htnote-widget-feedback){opacity:1;transform:translate(0,-50%) scale(1)}
  :where(.htnote-copyfields-row){transition:border-color calc(180ms * (1 - var(--ht-reduced-motion,0))) ease-out}
  :where(.htnote-copyfields-row:has([data-feedback="copied"])){--ht-widget-row-border:var(--ht-widget-accent)}
  :where([data-htnote-widget][data-htnote-bg="sepia"]){background:var(--ht-note-sepia);border-color:color-mix(in srgb,var(--ht-note-sepia) 75%,var(--ht-widget-muted));}
  :where([data-htnote-widget][data-htnote-bg="mint"]){background:var(--ht-note-mint);border-color:color-mix(in srgb,var(--ht-note-mint) 75%,var(--ht-widget-muted));}
  :where([data-htnote-widget][data-htnote-bg="rose"]){background:var(--ht-note-rose);border-color:color-mix(in srgb,var(--ht-note-rose) 75%,var(--ht-widget-muted));}
  :where([data-htnote-widget][data-htnote-bg="sky"]){background:var(--ht-note-sky);border-color:color-mix(in srgb,var(--ht-note-sky) 75%,var(--ht-widget-muted));}
  :where([data-htnote-widget][data-htnote-bg="lavender"]){background:var(--ht-note-lavender);border-color:color-mix(in srgb,var(--ht-note-lavender) 75%,var(--ht-widget-muted));}
  :where([data-htnote-widget][data-htnote-bg="charcoal"]){background:var(--ht-note-charcoal);border-color:color-mix(in srgb,var(--ht-note-charcoal) 75%,var(--ht-widget-muted));}
  :where(.htnote-checklist-items input){appearance:none;display:inline-grid;place-content:center;box-sizing:border-box;cursor:pointer;border:1px solid var(--ht-widget-border);background:var(--ht-widget-field)}
  :where(.htnote-checklist-items input:checked){background:var(--ht-widget-accent);border-color:var(--ht-widget-accent)}
  :where(.htnote-checklist-items input)::before{content:"";width:8px;height:4px;border-left:2px solid var(--ht-widget-surface);border-bottom:2px solid var(--ht-widget-surface);transform:translateY(-1px) rotate(-45deg);opacity:0}
  :where(.htnote-checklist-items input:checked)::before{opacity:1}
  @media print,(forced-colors:active){:where(.htnote-checklist-items input){appearance:auto}:where(.htnote-checklist-items input)::before{display:none}}
  /* Hareket kuralları, sonradan gelen taşınabilir widget stilinden daha özgüldür. */
  .htnote-textbox-input,.htnote-template-fields input,.htnote-calc-input,.htnote-calc-lines,.htnote-ipblock-fields input,.htnote-ipblock-fields select,.htnote-checklist-items input,.htnote-ipblock-list{
    transition:background-color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,border-color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,box-shadow calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,outline-color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out;
  }
  .htnote-textbox-input,.htnote-template-fields input,.htnote-ipblock-fields input,.htnote-ipblock-fields select,.htnote-checklist-items input,.htnote-ipblock-list{outline:2px solid transparent;outline-offset:2px}
  .htnote-calc-input{outline:2px solid transparent;outline-offset:-2px}
  .htnote-textbox-input:hover,.htnote-template-fields input:hover,.htnote-calc-lines:has(textarea:hover),.htnote-ipblock-fields input:hover,.htnote-ipblock-fields select:hover,.htnote-checklist-items input:not(:checked):hover{border-color:var(--ht-widget-accent);background-color:var(--ht-widget-hover)}
  .htnote-calc-input:hover{background-color:var(--ht-widget-hover)}
  .htnote-checklist-items input:checked:hover{box-shadow:0 0 0 3px color-mix(in srgb,var(--ht-widget-accent) 16%,transparent)}
  .htnote-textbox-input:focus-visible,.htnote-template-fields input:focus-visible,.htnote-calc-input:focus-visible,.htnote-ipblock-fields input:focus-visible,.htnote-ipblock-fields select:focus-visible,.htnote-checklist-items input:focus-visible,.htnote-ipblock-list:focus-visible{outline-color:var(--ht-widget-accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--ht-widget-accent) 12%,transparent)}
  .htnote-textbox-input:focus-visible,.htnote-template-fields input:focus-visible,.htnote-calc-lines:focus-within,.htnote-ipblock-fields input:focus-visible,.htnote-ipblock-fields select:focus-visible{border-color:var(--ht-widget-accent)}
  .htnote-calc-input:focus-visible{box-shadow:inset 0 0 0 4px color-mix(in srgb,var(--ht-widget-accent) 12%,transparent)}
  .htnote-ipblock-fields input[aria-invalid="true"]{border-color:var(--ht-widget-danger)}
  .htnote-checklist-items label{transition:color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,text-decoration-color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out}
  .htnote-checklist-items input::before{transition:opacity calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out}
  .htnote-widget-actions button,.htnote-copyfields-copy{transition:background-color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,border-color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,transform calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,opacity calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,outline-color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,box-shadow calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out;outline:2px solid transparent;outline-offset:2px}
  .htnote-widget-actions button:focus-visible,.htnote-copyfields-copy:focus-visible{outline-color:var(--ht-widget-accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--ht-widget-accent) 12%,transparent)}
  .htnote-widget-actions button:disabled,.htnote-copyfields-copy:disabled{opacity:.45}
  .htnote-copyfields-row{transition:background-color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,border-color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out}
  .htnote-copyfields-row:hover,.htnote-copyfields-row:focus-within{background-color:var(--ht-widget-hover);--ht-widget-row-border:var(--ht-widget-accent);border-color:var(--ht-widget-row-border)}
  .htnote-template-value,.htnote-template-placeholder{transition:color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,background-color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out,border-color calc(150ms * (1 - var(--ht-reduced-motion,0))) ease-out}
  .htnote-ipblock-output{position:relative;margin-top:12px}
  .htnote-ipblock-output > :is(.htnote-ipblock-list,.htnote-ipblock-empty,.htnote-ipblock-leaving){margin-top:0}
  .htnote-ipblock-leaving{position:absolute;inset:0 0 auto;pointer-events:none;user-select:none}
  [data-htnote-widget] [data-htnote-animate]{animation-duration:calc(160ms * (1 - var(--ht-reduced-motion,0)));animation-timing-function:ease-out}
  [data-htnote-widget] [data-htnote-animate="pop"]{animation-name:ht-widget-pop;animation-duration:calc(180ms * (1 - var(--ht-reduced-motion,0)))}
  [data-htnote-widget] [data-htnote-animate="fade"]{animation-name:ht-widget-fade}
  [data-htnote-widget] [data-htnote-animate="reveal"]{animation-name:ht-widget-reveal}
  [data-htnote-widget] [data-htnote-animate="enter"]{animation-name:ht-widget-enter;animation-timing-function:cubic-bezier(0.16,1,0.3,1)}
  [data-htnote-widget] [data-htnote-animate="leave"]{animation-name:ht-widget-leave;animation-fill-mode:forwards}
  [data-htnote-widget] [data-htnote-animate="highlight"]{animation-name:ht-widget-highlight;animation-duration:calc(150ms * (1 - var(--ht-reduced-motion,0)))}
  @keyframes ht-widget-pop{0%{transform:scale(.85)}60%{transform:scale(1.08)}100%{transform:scale(1)}}
  @keyframes ht-widget-fade{from{opacity:.65}to{opacity:1}}
  @keyframes ht-widget-reveal{from{opacity:0}to{opacity:1}}
  @keyframes ht-widget-enter{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
  @keyframes ht-widget-leave{from{opacity:1}to{opacity:0}}
  @keyframes ht-widget-highlight{from{background-color:color-mix(in srgb,var(--ht-widget-accent) 20%,var(--ht-widget-field))}to{}}
  html[data-ht-reduced-motion="true"] [data-htnote-widget] *,html[data-ht-reduced-motion="true"] [data-htnote-widget] *::before{transition:none!important;animation:none!important}
  html[data-ht-reduced-motion="true"] .htnote-ipblock-leaving{display:none}
  @media(prefers-reduced-motion:reduce){html:not([data-ht-reduced-motion]) [data-htnote-widget] *,html:not([data-ht-reduced-motion]) [data-htnote-widget] *::before{transition:none!important;animation:none!important}html:not([data-ht-reduced-motion]) .htnote-ipblock-leaving{display:none}}
  @media print{[data-htnote-widget] *,[data-htnote-widget] *::before{transition:none!important;animation:none!important}.htnote-ipblock-leaving{display:none!important}}
  ${printing ? '[data-htnote-widget] *,[data-htnote-widget] *::before{transition:none!important;animation:none!important}' : ""}
  @media print{.htnote-widget-actions,.htnote-copyfields-copy,.htnote-textbox-input{display:none!important}.htnote-textbox-print{display:block!important}.htnote-textbox-title{padding-right:0}.htnote-textbox{break-inside:auto}}
  ${printing ? ".htnote-widget-actions,.htnote-copyfields-copy,.htnote-textbox-input{display:none!important}.htnote-textbox-print{display:block!important}" : ""}
  `;
  document.head.append(boxStyle);
  const textBoxes = new WeakMap();
  let boxLabels = {};
  const widgetAnimations = new WeakMap();
  function widgetMotionEnabled() {
    if (printing || window.matchMedia?.("print").matches) return false;
    const reduced = root.style.getPropertyValue("--ht-reduced-motion").trim() || (root.dataset.htReducedMotion === "true" ? "1" : root.dataset.htReducedMotion === "false" ? "0" : "");
    if (reduced) return reduced !== "1";
    return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }
  // Yalnız kullanıcı olaylarından çağrılır; gözlemci ve ilk geliştirme hareket üretmez.
  function animateWidget(element, kind, onEnd) {
    if (!widgetMotionEnabled()) { onEnd?.(); return; }
    const previous = widgetAnimations.get(element);
    clearTimeout(previous?.timer);
    // Aynı öğede hızlı yazım animasyonu tekrar başlatır, DOM ve odak yerinde kalır.
    if (previous && element.dataset.htnoteAnimate === kind) {
      element.getAnimations?.().forEach((animation) => { if (animation.animationName?.startsWith("ht-widget-")) animation.currentTime = 0; });
    } else element.dataset.htnoteAnimate = kind;
    const finish = () => {
      const state = widgetAnimations.get(element);
      if (state?.finish !== finish) return;
      clearTimeout(state.timer); widgetAnimations.delete(element);
      delete element.dataset.htnoteAnimate;
      onEnd?.();
    };
    widgetAnimations.set(element, { finish, timer: setTimeout(finish, 200) });
  }
  root.addEventListener("animationend", (event) => {
    if (event.animationName?.startsWith("ht-widget-")) widgetAnimations.get(event.target)?.finish();
  });
  // Tür satırı gelecekteki widget'larda da aynı DOM ve etiket güncellemesini paylaşır.
  function createWidgetIcon(iconPaths) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(name, value);
    iconPaths.forEach((d) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.append(path);
    });
    return svg;
  }
  function createWidgetHeader(box, labelKey, iconPaths, actions) {
    const header = document.createElement("div"), type = document.createElement("span"), label = document.createElement("span"), heading = document.createElement("div");
    header.className = "htnote-widget-header";
    header.dataset.htnoteWidgetHeader = "true";
    type.className = "htnote-widget-type";
    const svg = createWidgetIcon(iconPaths);
    type.append(svg, label);
    heading.className = "htnote-widget-heading";
    const title = box.querySelector(`:scope > .htnote-${box.dataset.htnoteWidget}-title`);
    heading.append(type);
    if (title) heading.append(title);
    header.append(heading, actions);
    box.prepend(header);
    return () => {
      const text = boxLabels[labelKey] || "";
      if (label.textContent !== text) label.textContent = text;
    };
  }
  // Tüm widget'lar aynı panoyu, yerel yedeği ve odak/seçim korumasını kullanır.
  async function copyWidgetText(value, sourceInput) {
    const active = document.activeElement;
    const activeRange = active && typeof active.selectionStart === "number" ? [active.selectionStart, active.selectionEnd, active.selectionDirection] : null;
    const selection = window.getSelection();
    const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
    const scroll = { x: window.scrollX, y: window.scrollY };
    try { await navigator.clipboard.writeText(value); return true; } catch { /* Yerel kopyalama yedeğine geç. */ }
    const input = sourceInput || document.createElement("textarea");
    if (!sourceInput) {
      input.value = value;
      input.setAttribute("aria-hidden", "true");
      input.style.cssText = "position:fixed;opacity:0;pointer-events:none;top:0;left:0";
      document.body.append(input);
    }
    const start = input.selectionStart, end = input.selectionEnd, direction = input.selectionDirection;
    const top = input.scrollTop, left = input.scrollLeft;
    let copied = false;
    try { input.focus({ preventScroll: true }); input.select(); copied = document.execCommand("copy"); }
    catch { copied = false; }
    finally {
      input.setSelectionRange(start, end, direction);
      if (!sourceInput) input.remove();
      active?.focus?.({ preventScroll: true });
      if (activeRange) active.setSelectionRange(...activeRange);
      if (selection) { selection.removeAllRanges(); ranges.forEach((range) => selection.addRange(range)); }
      input.scrollTop = top; input.scrollLeft = left;
      if (window.scrollX !== scroll.x || window.scrollY !== scroll.y) window.scrollTo(scroll.x, scroll.y);
    }
    return copied;
  }
  function bindWidgetReset(button, labelKey) {
    const label = document.createElement("span");
    button.append(createWidgetIcon(["M3 11a9 9 0 1 1 2.5 6.2", "M3 4v7h7"]), label);
    return () => { const text = boxLabels[labelKey] || ""; if (label.textContent !== text) label.textContent = text; };
  }
  function bindWidgetCopy(button, labelKey, getValue, sourceInput, options = {}) {
    let feedback = labelKey, timer, fadeTimer;
    const label = document.createElement("span"), icons = document.createElement("span"), pill = document.createElement("span"), pillLabel = document.createElement("span"), status = document.createElement("span");
    label.className = "htnote-widget-label"; label.setAttribute("aria-hidden", "true");
    icons.className = "htnote-widget-copy-icons";
    icons.append(createWidgetIcon(["M9 9h12v12H9z", "M5 15H3V3h12v2"]), createWidgetIcon(["m5 12 4 4L19 6"]));
    pill.className = "htnote-widget-feedback"; pill.setAttribute("aria-hidden", "true");
    pill.append(createWidgetIcon(["m5 12 4 4L19 6"]), pillLabel);
    status.className = "htnote-widget-status";
    status.style.cssText = "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap";
    button.append(icons, label, pill, status);
    const update = () => {
      const baseLabel = labelKey === "copyRow" ? "" : boxLabels[labelKey] || "";
      if (label.textContent !== baseLabel) label.textContent = baseLabel;
      if (labelKey !== "copyRow") button.setAttribute("aria-label", baseLabel);
      const text = feedback === labelKey ? "" : boxLabels[feedback] || "";
      if (status.textContent !== text) status.textContent = text;
      // Görsel metin çıkış geçişinde kalır; canlı bölge 1,5 saniyede temizlenir.
      if (text && pillLabel.textContent !== text) pillLabel.textContent = text;
      if (text) pill.firstElementChild.style.display = feedback === "copyFailed" ? "none" : "";
      button.dataset.feedback = feedback;
    };
    button.setAttribute("aria-live", "polite");
    button.setAttribute("aria-atomic", "true");
    button.addEventListener("mousedown", (event) => event.preventDefault());
    const copy = async () => {
      if (options.canCopy && !options.canCopy()) return;
      const copied = await copyWidgetText(getValue(), sourceInput);
      feedback = copied ? "copied" : "copyFailed";
      clearTimeout(timer); clearTimeout(fadeTimer); update();
      timer = setTimeout(() => {
        feedback = labelKey; update();
        fadeTimer = setTimeout(() => { if (pillLabel.textContent) pillLabel.textContent = ""; }, 180);
      }, 1500);
    };
    button.addEventListener("click", copy);
    options.doubleClickTarget?.addEventListener("dblclick", copy);
    return update;
  }
  function enhanceTextBox(box) {
    if (textBoxes.has(box)) return;
    const input = box.querySelector(":scope > textarea.htnote-textbox-input");
    if (!input) return;
    const actions = document.createElement("div");
    actions.className = "htnote-widget-actions htnote-textbox-actions";
    const copy = document.createElement("button"), reset = document.createElement("button");
    copy.type = reset.type = "button";
    copy.dataset.testid = "textbox-copy"; reset.dataset.testid = "textbox-reset";
    actions.append(copy, reset);
    const updateReset = bindWidgetReset(reset, "reset");
    const updateHeader = createWidgetHeader(box, "textboxType", ["M5 4h14", "M12 4v16", "M8 20h8"], actions);
    const mirror = document.createElement("pre");
    mirror.className = "htnote-textbox-print";
    mirror.setAttribute("aria-hidden", "true");
    const updateCopy = bindWidgetCopy(copy, "copy", () => input.value, input);
    const update = () => {
      updateHeader();
      updateCopy();
      updateReset();
      reset.disabled = input.value === input.defaultValue;
      // Aynı metin gözlemci döngüsü oluşturmasın.
      if (mirror.textContent !== input.value) mirror.textContent = input.value;
      if (!window.CSS?.supports?.("field-sizing", "content")) {
        input.style.height = "auto";
        input.style.height = `${Math.max(input.scrollHeight, 3 * (parseFloat(getComputedStyle(input).lineHeight) || 21))}px`;
      }
    };
    reset.addEventListener("click", () => { input.value = input.defaultValue; update(); animateWidget(input, "highlight"); });
    input.addEventListener("input", update);
    textBoxes.set(box, { update });
    box.append(mirror);
    update();
  }
  const checklists = new WeakMap();
  function enhanceChecklist(box) {
    if (checklists.has(box)) return;
    const list = box.querySelector(":scope > ul.htnote-checklist-items");
    if (!list) return;
    const actions = document.createElement("div");
    actions.className = "htnote-widget-actions";
    const reset = document.createElement("button"), copy = document.createElement("button");
    reset.type = copy.type = "button";
    reset.dataset.testid = "checklist-reset"; copy.dataset.testid = "checklist-copy";
    actions.append(reset, copy);
    const updateReset = bindWidgetReset(reset, "checklistReset");
    const updateHeader = createWidgetHeader(box, "checklistType", ["m3 5 2 2 4-4", "M13 6h8", "m3 12 2 2 4-4", "M13 13h8", "M5 20h.01", "M13 20h8"], actions);
    const summary = document.createElement("div"), counter = document.createElement("span"), progress = document.createElement("div"), fill = document.createElement("div");
    summary.className = "htnote-checklist-summary";
    counter.dataset.testid = "checklist-counter";
    progress.className = "htnote-checklist-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuemin", "0");
    progress.append(fill); summary.append(counter, progress); list.before(summary);
    const inputs = () => Array.from(list.querySelectorAll('li > label > input[type="checkbox"]')).filter((input) => {
      const empty = !input.parentElement.textContent.trim();
      input.parentElement.parentElement.hidden = empty;
      return !empty;
    });
    const updateCopy = bindWidgetCopy(copy, "copyRemaining", () => inputs().filter((input) => !input.checked).map((input) => input.parentElement.textContent.replace(/^ /, "")).join("\n"));
    let completed = false;
    const update = (animate = false) => {
      updateHeader();
      const rows = inputs(), count = rows.filter((input) => input.checked).length;
      const value = `${count} / ${rows.length}`;
      if (counter.textContent !== value) { counter.textContent = value; if (animate) animateWidget(counter, "fade"); }
      const allDone = rows.length > 0 && count === rows.length;
      if (animate && allDone && !completed) { animateWidget(summary, "highlight"); animateWidget(progress, "fade"); }
      completed = allDone;
      progress.setAttribute("aria-valuemax", String(rows.length));
      progress.setAttribute("aria-valuenow", String(count));
      progress.setAttribute("aria-label", boxLabels.checklistProgress || "");
      fill.style.width = `${rows.length ? count / rows.length * 100 : 0}%`;
      rows.forEach((input) => {
        // Yalnız geçici durum sınıfı değişir; checked özniteliğine dokunulmaz.
        input.parentElement.classList.toggle("htnote-checklist-done", input.checked);
      });
      reset.disabled = rows.every((input) => input.checked === input.defaultChecked);
      updateReset();
      updateCopy();
    };
    reset.addEventListener("click", () => {
      inputs().forEach((input) => { if (input.checked !== input.defaultChecked) { input.checked = input.defaultChecked; animateWidget(input.parentElement, "highlight"); } });
      update(true);
    });
    list.addEventListener("change", (event) => {
      if (!inputs().includes(event.target)) return;
      animateWidget(event.target, "pop"); update(true);
    });
    checklists.set(box, { update });
    update();
  }
  const copyFields = new WeakMap();
  function enhanceCopyFields(box) {
    if (copyFields.has(box)) return;
    const list = box.querySelector(":scope > dl.htnote-copyfields-list");
    if (!list) return;
    const actions = document.createElement("div"), copy = document.createElement("button");
    actions.className = "htnote-widget-actions";
    copy.type = "button"; copy.dataset.testid = "copyfields-copy-all";
    actions.append(copy);
    const updateHeader = createWidgetHeader(box, "copyfieldsType", ["M9 5H5v16h14V5h-4", "M9 3h6v4H9z", "M9 12h6", "M9 16h6"], actions);
    const rows = () => Array.from(list.querySelectorAll(":scope > div.htnote-copyfields-row"));
    const updateCopy = bindWidgetCopy(copy, "copyAll", () => rows().map((row) => {
      const label = row.querySelector(":scope > dt")?.textContent || "";
      const value = row.querySelector(":scope > dd")?.textContent || "";
      return value.trim() ? (label ? `${label}: ${value}` : value) : null;
    }).filter((value) => value !== null).join("\n"));
    const bindings = new WeakMap();
    const update = () => {
      updateHeader(); updateCopy();
      rows().forEach((row, index) => {
        const label = row.querySelector(":scope > dt"), value = row.querySelector(":scope > dd");
        if (!label || !value) return;
        if (!value.textContent.trim()) {
          bindings.get(row)?.button.remove();
          return;
        }
        if (!bindings.has(row)) {
          const button = document.createElement("button");
          button.type = "button"; button.className = "htnote-copyfields-copy"; button.dataset.testid = "copyfields-copy-row";
          row.append(button);
          const updateRow = bindWidgetCopy(button, "copyRow", () => value.textContent, null, {
            doubleClickTarget: value,
            canCopy: () => !!value.textContent.trim(),
          });
          bindings.set(row, { button, update: updateRow });
        }
        const binding = bindings.get(row);
        if (binding.button.parentElement !== row) row.append(binding.button);
        const name = label.textContent || value.textContent.slice(0, 40) || (boxLabels.copyfieldsRow || "").replace("{{index}}", String(index + 1));
        const accessibleName = (boxLabels.copyRow || "").replace("{{name}}", () => name);
        if (binding.button.getAttribute("aria-label") !== accessibleName) {
          binding.button.setAttribute("aria-label", accessibleName); binding.button.title = accessibleName;
        }
        binding.update();
      });
    };
    copyFields.set(box, { update });
    update();
  }
  const templates = new WeakMap();
  let templateId = 0;
  function enhanceTemplate(box) {
    if (templates.has(box)) return;
    const source = box.querySelector(":scope > textarea.htnote-template-source");
    if (!source) return;
    const actions = document.createElement("div"), copy = document.createElement("button"), reset = document.createElement("button");
    actions.className = "htnote-widget-actions";
    copy.type = reset.type = "button";
    copy.dataset.testid = "template-copy"; reset.dataset.testid = "template-reset";
    copy.className = "htnote-template-copy";
    actions.append(copy);
    const updateReset = bindWidgetReset(reset, "templateReset");
    const updateHeader = createWidgetHeader(box, "templateType", ["M14 2H6v20h12V6z", "M14 2v6h4", "M8 13h8", "M8 17h8"], actions);
    const layout = document.createElement("div"), fields = document.createElement("div"), panel = document.createElement("div");
    const heading = document.createElement("span"), preview = document.createElement("div");
    layout.className = "htnote-template-layout"; fields.className = "htnote-template-fields";
    panel.className = "htnote-template-panel"; heading.className = "htnote-template-preview-heading";
    preview.className = "htnote-template-preview"; preview.dataset.testid = "template-preview";
    panel.append(heading, preview); layout.append(fields, panel); box.append(layout);
    source.hidden = true;
    let parsed, savedSource, rendered, previewTemplate;
    const inputs = new Map();
    const output = () => parsed.segments.map((segment) => "text" in segment ? segment.text : inputs.get(segment.key).value).join("");
    const updateCopy = bindWidgetCopy(copy, "copy", output);
    const render = (animate = false) => {
      reset.disabled = Array.from(inputs.values()).every((input) => input.value === input.defaultValue);
      // Gözlemci, aynı önizlemeyi yeniden kurup kendini tetiklememeli.
      const signature = JSON.stringify([parsed, Array.from(inputs.values(), (input) => input.value)]);
      if (signature === rendered) return;
      rendered = signature;
      if (previewTemplate !== parsed) {
        previewTemplate = parsed;
        preview.replaceChildren(...parsed.segments.map((segment) => "text" in segment ? document.createTextNode(segment.text) : document.createElement("span")));
      }
      parsed.segments.forEach((segment, index) => {
        if ("text" in segment) return;
        const input = inputs.get(segment.key), span = preview.childNodes[index];
        const className = input.value ? "htnote-template-value" : "htnote-template-placeholder";
        const value = input.value || parsed.variables.find((variable) => variable.key === segment.key).name;
        const changed = span.textContent !== value || span.className !== className;
        span.className = className;
        if (span.textContent !== value) span.textContent = value;
        if (animate && changed) animateWidget(span, "highlight");
      });
    };
    const update = () => {
      updateHeader(); updateCopy();
      updateReset();
      if (heading.textContent !== (boxLabels.templatePreview || "")) heading.textContent = boxLabels.templatePreview || "";
      if (savedSource !== source.defaultValue) {
        savedSource = source.defaultValue;
        parsed = templateEngine.parseTemplate(savedSource);
        inputs.clear(); fields.replaceChildren();
        parsed.variables.forEach((variable, index) => {
          const row = document.createElement("div"), label = document.createElement("label"), input = document.createElement("input");
          let id;
          do { id = `htnote-template-${++templateId}-${index}`; } while (document.getElementById(id));
          input.type = "text"; input.id = id; input.dataset.testid = "template-variable";
          input.value = variable.defaultValue; input.defaultValue = input.value;
          label.htmlFor = id; label.textContent = variable.name;
          input.addEventListener("input", () => render(true));
          inputs.set(variable.key, input); row.append(label, input); fields.append(row);
        });
        if (parsed.variables.length) { actions.prepend(reset); fields.hidden = false; }
        else { reset.remove(); fields.hidden = true; }
      }
      render();
    };
    reset.addEventListener("click", () => {
      inputs.forEach((input) => { if (input.value !== input.defaultValue) { input.value = input.defaultValue; animateWidget(input, "highlight"); } });
      render(true);
    });
    templates.set(box, { update });
    update();
  }
  const calcs = new WeakMap();
  function enhanceCalc(box) {
    if (calcs.has(box)) return;
    const input = box.querySelector(":scope > textarea.htnote-calc-input");
    if (!input) return;
    const actions = document.createElement("div"), copy = document.createElement("button"), reset = document.createElement("button");
    actions.className = "htnote-widget-actions";
    copy.type = reset.type = "button";
    copy.dataset.testid = "calc-copy"; reset.dataset.testid = "calc-reset";
    actions.append(copy, reset);
    const updateReset = bindWidgetReset(reset, "calcReset");
    const updateHeader = createWidgetHeader(box, "calcType", ["M6 2h12v20H6z", "M9 6h6", "M9 10h.01", "M15 10h.01", "M9 14h.01", "M15 14v4", "M9 18h.01"], actions);
    const layout = document.createElement("div"), results = document.createElement("div"), mirror = document.createElement("div");
    const totalRow = document.createElement("div"), totalLabel = document.createElement("strong"), totalValue = document.createElement("strong"), limit = document.createElement("p");
    layout.className = "htnote-calc-lines"; results.className = "htnote-calc-results"; mirror.className = "htnote-calc-print";
    mirror.setAttribute("aria-hidden", "true");
    totalRow.className = "htnote-calc-total"; totalValue.dataset.testid = "calc-total";
    limit.className = "htnote-calc-error"; limit.setAttribute("role", "status");
    input.wrap = "soft";
    // Textarea varsayılan metni taşınırken değiştirilmez; düzenlemeler yalnız value'dadır.
    input.before(layout); layout.append(input, results); layout.after(mirror); totalRow.append(totalLabel, totalValue); box.append(limit, totalRow);
    let calculation, rendered;
    const updateCopy = bindWidgetCopy(copy, "calcCopyTotal", () => calculation.formattedTotal);
    const update = (animate = false) => {
      updateHeader(); updateCopy();
      updateReset();
      if (totalLabel.textContent !== (boxLabels.calcTotal || "")) totalLabel.textContent = boxLabels.calcTotal || "";
      input.setAttribute("aria-label", boxLabels.calcContent || "");
      reset.disabled = input.value === input.defaultValue;
      const signature = JSON.stringify([input.value, boxLabels.locale, boxLabels.calcError, boxLabels.calcLimit]);
      if (signature === rendered) return;
      rendered = signature;
      calculation = calcEngine.evaluateCalc(input.value, boxLabels.locale);
      const previousCells = Array.from(results.children), changedCells = [];
      const cells = calculation.lines.map((line, index) => {
        const cell = previousCells[index] || document.createElement("div");
        const changed = cell.textContent !== line.formatted;
        cell.dataset.testid = "calc-result";
        if (changed) cell.textContent = line.formatted;
        cell.className = line.status === "error" ? "htnote-calc-error" : "";
        if (line.status === "error") {
          cell.title = boxLabels.calcError || ""; cell.setAttribute("aria-label", boxLabels.calcError || "");
        } else {
          cell.removeAttribute("title"); cell.removeAttribute("aria-label");
        }
        if (changed) changedCells.push(cell);
        return cell;
      });
      if (previousCells.length !== cells.length) results.replaceChildren(...cells);
      if (animate) changedCells.forEach((cell) => animateWidget(cell, "fade"));
      if (totalValue.textContent !== calculation.formattedTotal) { totalValue.textContent = calculation.formattedTotal; if (animate) animateWidget(totalValue, "fade"); }
      const showLimit = calculation.limited && (limit.hidden || limit.textContent !== (boxLabels.calcLimit || ""));
      limit.hidden = !calculation.limited; limit.textContent = calculation.limited ? boxLabels.calcLimit || "" : "";
      if (animate && showLimit) animateWidget(limit, "enter");
      mirror.replaceChildren(...(calculation.limited ? [input.value] : input.value.split(/\r\n|[\r\n]/)).map((expression, index) => {
        const row = document.createElement("div"), source = document.createElement("pre"), result = document.createElement("span");
        source.textContent = expression || "\u00a0";
        result.textContent = calculation.lines[index]?.formatted || (calculation.limited ? "?" : "");
        row.append(source, result); return row;
      }));
      input.style.height = "auto";
      input.style.height = `${Math.max(input.scrollHeight, 3 * (parseFloat(getComputedStyle(input).lineHeight) || 21) + 16)}px`;
    };
    reset.addEventListener("click", () => { input.value = input.defaultValue; update(true); animateWidget(input, "highlight"); });
    input.addEventListener("input", () => update(true));
    input.addEventListener("scroll", () => { results.scrollTop = input.scrollTop; });
    calcs.set(box, { update }); update();
  }
  const ipBlocks = new WeakMap();
  let ipBlockId = 0;
  function enhanceIpBlock(box) {
    if (ipBlocks.has(box)) return;
    const list = box.querySelector(":scope > pre.htnote-ipblock-list");
    if (!list || !box.hasAttribute("data-htnote-gw") || !box.hasAttribute("data-htnote-prefix")) return;
    const savedGateway = box.dataset.htnoteGw, savedPrefix = box.dataset.htnotePrefix;
    const actions = document.createElement("div"), reset = document.createElement("button"), copy = document.createElement("button");
    actions.className = "htnote-widget-actions";
    reset.type = copy.type = "button";
    reset.dataset.testid = "ipblock-reset"; copy.dataset.testid = "ipblock-copy";
    actions.append(reset, copy);
    const updateReset = bindWidgetReset(reset, "reset");
    const updateHeader = createWidgetHeader(box, "ipblockType", ["M9 2h6v6H9z", "M2 16h6v6H2z", "M16 16h6v6h-6z", "M12 8v4", "M5 16v-4h14v4"], actions);
    const fields = document.createElement("div"), gatewayLabel = document.createElement("label"), prefixLabel = document.createElement("label");
    const gatewayText = document.createElement("span"), prefixText = document.createElement("span");
    const gateway = document.createElement("input"), prefix = document.createElement("select"), summary = document.createElement("p"), error = document.createElement("p"), printInputs = document.createElement("p"), empty = document.createElement("p");
    let id;
    do { id = `htnote-ipblock-${++ipBlockId}`; } while (document.getElementById(`${id}-error`));
    fields.className = "htnote-ipblock-fields"; summary.className = "htnote-ipblock-summary";
    error.className = "htnote-ipblock-error"; error.id = `${id}-error`; error.setAttribute("role", "status");
    empty.className = "htnote-ipblock-empty"; empty.dataset.testid = "ipblock-empty";
    gateway.type = "text"; gateway.spellcheck = false; gateway.value = savedGateway;
    gateway.dataset.testid = "ipblock-gateway"; prefix.dataset.testid = "ipblock-prefix"; summary.dataset.testid = "ipblock-summary";
    for (let value = 24; value <= 30; value++) {
      const option = document.createElement("option"); option.value = String(value); option.textContent = `/${value}`; prefix.append(option);
    }
    prefix.value = savedPrefix;
    gatewayLabel.append(gatewayText, gateway); prefixLabel.append(prefixText, prefix); fields.append(gatewayLabel, prefixLabel);
    printInputs.className = "htnote-ipblock-print";
    list.before(fields, error, summary, printInputs);
    const output = document.createElement("div"); output.className = "htnote-ipblock-output";
    list.before(output); output.append(list, empty);
    list.dataset.testid = "ipblock-list"; list.tabIndex = 0;
    let result, leaving;
    const updateCopy = bindWidgetCopy(copy, "ipblockCopyList", () => result.hosts.join("\n"), undefined, { canCopy: () => !!result && !result.error });
    const setText = (element, value) => { if (element.textContent !== value) element.textContent = value; };
    const update = (animate = false) => {
      updateHeader(); updateReset(); updateCopy();
      setText(gatewayText, boxLabels.ipblockGateway || ""); setText(prefixText, boxLabels.ipblockPrefix || "");
      gateway.placeholder = boxLabels.ipblockPlaceholder || "";
      const previous = result;
      result = ipEngine.calculateIpBlock(gateway.value, Number(prefix.value));
      const switched = previous && !!previous.error !== !!result.error;
      if (animate && switched && widgetMotionEnabled()) {
        leaving?.remove();
        const outgoing = previous.error ? empty : list;
        const snapshot = document.createElement(previous.error ? "p" : "pre");
        snapshot.className = `htnote-ipblock-${previous.error ? "empty" : "list"}-snapshot htnote-ipblock-leaving`;
        snapshot.setAttribute("aria-hidden", "true"); snapshot.textContent = outgoing.textContent;
        output.append(snapshot); snapshot.scrollTop = outgoing.scrollTop;
        leaving = snapshot;
        animateWidget(snapshot, "leave", () => snapshot.remove());
      }
      copy.disabled = !!result.error;
      reset.disabled = gateway.value === savedGateway && prefix.value === savedPrefix;
      const hasError = !!result.error && result.error !== "empty";
      gateway.setAttribute("aria-invalid", String(hasError));
      if (hasError) gateway.setAttribute("aria-describedby", error.id); else gateway.removeAttribute("aria-describedby");
      const errorKey = result.error === "gatewayBoundary" ? "ipblockGatewayBoundary" : result.error === "invalidPrefix" ? "ipblockInvalidPrefix" : "ipblockInvalidIPv4";
      const errorText = hasError ? boxLabels[errorKey] || "" : "";
      const showError = hasError && (error.hidden || error.textContent !== errorText);
      error.hidden = !hasError; summary.hidden = !!result.error;
      list.hidden = !!result.error; empty.hidden = !result.error;
      setText(error, errorText);
      if (animate && showError) animateWidget(error, "enter");
      setText(empty, result.error ? boxLabels.ipblockEmpty || "" : "");
      const count = new Intl.NumberFormat(boxLabels.locale === "en" ? "en" : "tr").format(result.hosts.length);
      const summaryText = (boxLabels.ipblockSummary || "").replace(/\{\{(block|count)\}\}/g, (_, key) => key === "block" ? `${result.network}/${prefix.value}` : count);
      const summaryChanged = summary.textContent !== (result.error ? "" : summaryText);
      const listChanged = list.textContent !== result.hosts.join("\n");
      setText(summary, result.error ? "" : summaryText);
      setText(list, result.hosts.join("\n"));
      if (animate) {
        if (switched) animateWidget(result.error ? empty : list, "reveal");
        else if (listChanged && !result.error) animateWidget(list, "fade");
        if (summaryChanged && !result.error) animateWidget(summary, "fade");
      }
      setText(printInputs, `${boxLabels.ipblockGateway || ""}: ${gateway.value} · ${boxLabels.ipblockPrefix || ""}: /${prefix.value}`);
    };
    gateway.addEventListener("input", () => update(true)); prefix.addEventListener("change", () => update(true));
    reset.addEventListener("click", () => {
      const gatewayChanged = gateway.value !== savedGateway, prefixChanged = prefix.value !== savedPrefix;
      gateway.value = savedGateway; prefix.value = savedPrefix; update(true);
      if (gatewayChanged) animateWidget(gateway, "highlight");
      if (prefixChanged) animateWidget(prefix, "highlight");
    });
    ipBlocks.set(box, { update }); update();
  }
  function scanWidgets(node) {
    if (node.nodeType !== 1) return;
    for (const [kind, enhance] of [["textbox", enhanceTextBox], ["checklist", enhanceChecklist], ["copyfields", enhanceCopyFields], ["template", enhanceTemplate], ["calc", enhanceCalc], ["ipblock", enhanceIpBlock]]) {
      const selector = `[data-htnote-widget="${kind}"]`;
      if (node.matches(selector)) enhance(node);
      node.querySelectorAll(selector).forEach(enhance);
    }
  }
  function updateWidgets() {
    document.querySelectorAll('[data-htnote-widget]').forEach((box) => {
      textBoxes.get(box)?.update(); checklists.get(box)?.update(); copyFields.get(box)?.update(); templates.get(box)?.update(); calcs.get(box)?.update(); ipBlocks.get(box)?.update();
    });
  }
  scanWidgets(root);
  new MutationObserver((records) => {
    // Aynı widget'ın çok sayıda sonuç/değer değişimi tek geliştirmede birleştirilir.
    const boxes = new Set();
    records.forEach((record) => {
      record.addedNodes.forEach(scanWidgets);
      const box = record.target.nodeType === 1 ? record.target.closest('[data-htnote-widget]') : record.target.parentElement?.closest('[data-htnote-widget]');
      if (box) boxes.add(box);
    });
    boxes.forEach((box) => { scanWidgets(box); textBoxes.get(box)?.update(); checklists.get(box)?.update(); copyFields.get(box)?.update(); templates.get(box)?.update(); calcs.get(box)?.update(); ipBlocks.get(box)?.update(); });
  }).observe(root, { childList: true, subtree: true, characterData: true });
  window.addEventListener("beforeprint", updateWidgets);
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
  // Host dinleyicisi ayrı origin'deki iframe'e ulaşamaz; kural burada da uygulanır.
  const textInputTypes = new Set(["text", "search", "email", "url", "tel", "password", "number"]);
  window.addEventListener("contextmenu", (event) => {
    const target = event.target;
    const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
    if (element) {
      if (element.closest("textarea, .cm-editor")) return;
      if (element instanceof HTMLInputElement && textInputTypes.has(element.type)) return;
      const editable = element.closest("[contenteditable]")?.getAttribute("contenteditable")?.toLowerCase();
      if (editable === "" || editable === "true" || editable === "plaintext-only") return;
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        for (let index = 0; index < selection.rangeCount; index++) {
          const range = selection.getRangeAt(index);
          if (!range.collapsed && range.intersectsNode(element)) return;
        }
      }
    }
    event.preventDefault();
  });
  const send = (type, payload = {}) => window.parent.postMessage({ type, ...payload }, "*");
  if (pathname.includes("/__draft/")) {
    const style = document.createElement("style");
    style.textContent = '@media screen{:where([data-htnote-widget]:hover){outline:1px dashed var(--ht-accent,#4f46e5);outline-offset:3px}}';
    document.head.append(style);
    document.addEventListener("click", (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
        || event.defaultPrevented || window.getSelection()?.isCollapsed === false) return;
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target || target.closest('a, button, input, textarea, select, option, label, summary, audio, video, [contenteditable], [role="button"], [role="checkbox"], [tabindex]')) return;
      const widget = target.closest("[data-htnote-widget]");
      if (widget) {
        const index = Array.from(document.querySelectorAll("[data-htnote-widget]")).indexOf(widget);
        send("HTNOTE_REVEAL_SOURCE", { kind: "widget", index, widget: widget.getAttribute("data-htnote-widget"), path: pathname });
        return;
      }
      const main = target.closest("main#htnote-content");
      if (!main || target === main) return;
      let block = target;
      while (block.parentElement !== main) block = block.parentElement;
      send("HTNOTE_REVEAL_SOURCE", { kind: "block", index: Array.from(main.children).indexOf(block), tag: block.localName.toLowerCase(), path: pathname });
    });
  }
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
    const { type, vars, mode, query, scrollY, token, contentWidth, audioLabels: labels, labels: widgetLabels } = e.data;
    if (type === "HTNOTE_THEME" && widgetLabels && typeof widgetLabels === "object" && !Array.isArray(widgetLabels)) {
      for (const key of ["copy", "copied", "copyFailed", "reset", "textboxType", "checklistType", "checklistReset", "copyRemaining", "checklistProgress", "copyfieldsType", "copyAll", "copyRow", "copyfieldsRow", "templateType", "templateReset", "templatePreview", "calcType", "calcReset", "calcCopyTotal", "calcTotal", "calcContent", "calcError", "calcLimit", "ipblockType", "ipblockCopyList", "ipblockGateway", "ipblockPrefix", "ipblockPlaceholder", "ipblockSummary", "ipblockInvalidIPv4", "ipblockInvalidPrefix", "ipblockGatewayBoundary", "ipblockEmpty"]) {
        if (typeof widgetLabels[key] === "string" && widgetLabels[key].length <= 200) boxLabels[key] = widgetLabels[key];
      }
      if (Object.prototype.hasOwnProperty.call(widgetLabels, "locale")) boxLabels.locale = widgetLabels.locale === "en" ? "en" : "tr";
      updateWidgets();
    }
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
      const reducedMotion = root.style.getPropertyValue("--ht-reduced-motion").trim();
      if (reducedMotion) {
        root.dataset.htReducedMotion = reducedMotion === "1" ? "true" : "false";
      } else if (vars && Object.prototype.hasOwnProperty.call(vars, "--ht-reduced-motion")) {
        delete root.dataset.htReducedMotion;
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
