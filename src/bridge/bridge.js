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
    s.textContent = ":where(html){background:var(--ht-note-bg,var(--ht-bg));color:var(--ht-text);color-scheme:light dark}:where(*:not(html)){scrollbar-width:thin;scrollbar-color:var(--ht-scrollbar,var(--ht-border)) transparent}:where(*:hover){scrollbar-color:var(--ht-scrollbar-hover,var(--ht-muted)) transparent}:where(*)::-webkit-scrollbar{width:8px;height:8px}:where(*)::-webkit-scrollbar-track,:where(*)::-webkit-scrollbar-corner{background:transparent}:where(*)::-webkit-scrollbar-thumb{background:var(--ht-scrollbar,var(--ht-border));border:2px solid transparent;border-radius:999px;background-clip:padding-box}:where(*)::-webkit-scrollbar-thumb:hover{background-color:var(--ht-scrollbar-hover,var(--ht-muted))}:where(html){scrollbar-width:none}:where(html)::-webkit-scrollbar{width:0;height:0}";
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
      host.dataset.reducedMotion = String(root.style.getPropertyValue("--ht-reduced-motion").trim() === "1" || (!root.style.getPropertyValue("--ht-reduced-motion") && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
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
  :where(html){--ht-widget-surface:#ffffff;--ht-widget-text:#0d1c2e;--ht-widget-accent:#4648d4;--ht-widget-border:#7b8598;--ht-widget-divider:#e0e3ee;--ht-widget-muted:#464554;--ht-widget-field:#f8f9ff;--ht-widget-hover:#e6eeff;--ht-note-sepia:#faf3e5;--ht-note-mint:#eaf5ee;--ht-note-rose:#faedf1;--ht-note-sky:#edf4fc;--ht-note-lavender:#f2eefb;--ht-note-charcoal:#e9edf2;}
  @media(prefers-color-scheme:dark){:where(html:not([data-ht-theme])){--ht-widget-surface:#101623;--ht-widget-text:#f1f5f9;--ht-widget-accent:#a5a6ff;--ht-widget-border:#78849b;--ht-widget-divider:#303647;--ht-widget-muted:#a8b6cc;--ht-widget-field:#0d1220;--ht-widget-hover:#222c40;--ht-note-sepia:#302b23;--ht-note-mint:#23352b;--ht-note-rose:#35252d;--ht-note-sky:#243043;--ht-note-lavender:#2e2940;--ht-note-charcoal:#171d25;}}
  :where(html[data-ht-theme="dark"]){--ht-widget-surface:#101623;--ht-widget-text:#f1f5f9;--ht-widget-accent:#a5a6ff;--ht-widget-border:#78849b;--ht-widget-divider:#303647;--ht-widget-muted:#a8b6cc;--ht-widget-field:#0d1220;--ht-widget-hover:#222c40;--ht-note-sepia:#302b23;--ht-note-mint:#23352b;--ht-note-rose:#35252d;--ht-note-sky:#243043;--ht-note-lavender:#2e2940;--ht-note-charcoal:#171d25;}

:where(.htnote-textbox){position:relative;box-sizing:border-box;margin:1em 0;padding:12px;border:1px solid var(--ht-widget-border,#7b8598);border-radius:12px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-surface,#ffffff)}
:where(.htnote-textbox-input){box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--ht-widget-border,#7b8598);border-radius:8px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-field,#f8f9ff)}
:where(.htnote-textbox-title){font-weight:700;min-height:1lh;margin-bottom:8px;white-space:pre-wrap;overflow-wrap:anywhere}
:where(.htnote-textbox-input){display:block;min-height:4.8em;field-sizing:content;resize:vertical;font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-y:hidden}
:where(.htnote-textbox-input:focus-visible){outline:2px solid var(--ht-widget-accent,#4648d4);outline-offset:2px}

  :where([data-htnote-widget][data-htnote-bg="sepia"]){background:var(--ht-note-sepia);}
  :where([data-htnote-widget][data-htnote-bg="mint"]){background:var(--ht-note-mint);}
  :where([data-htnote-widget][data-htnote-bg="rose"]){background:var(--ht-note-rose);}
  :where([data-htnote-widget][data-htnote-bg="sky"]){background:var(--ht-note-sky);}
  :where([data-htnote-widget][data-htnote-bg="lavender"]){background:var(--ht-note-lavender);}
  :where([data-htnote-widget][data-htnote-bg="charcoal"]){background:var(--ht-note-charcoal);}
  :where(.htnote-widget-header){display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;font-family:var(--ht-font,system-ui,sans-serif)}
  :where(.htnote-widget-type){display:inline-flex;align-items:center;gap:6px;min-width:0;color:var(--ht-widget-muted,#464554);font-size:11px;font-weight:700;letter-spacing:.04em}
  :where(.htnote-widget-type svg){width:14px;height:14px;flex-shrink:0;color:var(--ht-widget-accent,#4648d4)}
  :where(.htnote-widget-actions){display:flex;flex-shrink:0;flex-wrap:wrap;gap:4px;font:12px/1.4 var(--ht-font,system-ui,sans-serif)}
  .htnote-widget-actions button{border:1px solid var(--ht-widget-border,#7b8598);border-radius:8px;padding:4px 8px;color:var(--ht-widget-text,#0d1c2e);background:var(--ht-widget-surface,#ffffff);cursor:pointer}
  .htnote-widget-actions button:hover{background:var(--ht-widget-hover,#e6eeff)}
  .htnote-widget-actions button:disabled{opacity:.45;cursor:default}
  .htnote-widget-actions button:focus-visible{outline:2px solid var(--ht-widget-accent,#4648d4);outline-offset:2px}
  .htnote-widget-actions button[data-feedback="copied"]{color:var(--ht-widget-accent,#4648d4)}
:where(.htnote-checklist){box-sizing:border-box;margin:1em 0;padding:12px;border:1px solid var(--ht-widget-border);border-radius:12px;color:var(--ht-widget-text);background:var(--ht-widget-surface)}
:where(.htnote-checklist-title){font-weight:700;min-height:1lh;margin-bottom:8px;white-space:pre-wrap;overflow-wrap:anywhere}
:where(.htnote-checklist-items){list-style:none;margin:0;padding:0}
:where(.htnote-checklist-items li){padding:10px 0;border-top:1px solid var(--ht-widget-divider);overflow-wrap:anywhere}
:where(.htnote-checklist-items label){cursor:pointer}
:where(.htnote-checklist-items input){appearance:auto;width:16px;height:16px;vertical-align:middle;accent-color:var(--ht-widget-accent)}
:where(.htnote-checklist-items input:focus-visible){outline:2px solid var(--ht-widget-accent);outline-offset:2px}
  :where(.htnote-checklist-summary){padding:8px 0 14px;border-top:1px solid var(--ht-widget-divider);color:var(--ht-widget-accent);font-size:12px}
  :where(.htnote-checklist-summary > span){display:block;text-align:right;margin-bottom:6px}
  :where(.htnote-checklist-progress){height:5px;border:1px solid var(--ht-widget-border);border-radius:8px;background:var(--ht-widget-field);overflow:hidden}
  :where(.htnote-checklist-progress > div){height:100%;background:var(--ht-widget-accent)}
  :where(.htnote-checklist-done){color:var(--ht-widget-muted);text-decoration:line-through}
  .htnote-textbox-print{display:none;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;margin:0}
  @media print{.htnote-widget-actions,.htnote-textbox-input{display:none!important}.htnote-textbox-print{display:block!important}.htnote-textbox-title{padding-right:0}.htnote-textbox{break-inside:auto}}
  ${printing ? ".htnote-widget-actions,.htnote-textbox-input{display:none!important}.htnote-textbox-print{display:block!important}" : ""}
  `;
  document.head.append(boxStyle);
  const textBoxes = new WeakMap();
  let boxLabels = {};
  // Tür satırı gelecekteki widget'larda da aynı DOM ve etiket güncellemesini paylaşır.
  function createWidgetHeader(box, labelKey, iconPaths, actions) {
    const header = document.createElement("div"), type = document.createElement("span"), label = document.createElement("span");
    header.className = "htnote-widget-header";
    header.dataset.htnoteWidgetHeader = "true";
    type.className = "htnote-widget-type";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(name, value);
    iconPaths.forEach((d) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.append(path);
    });
    type.append(svg, label);
    header.append(type, actions);
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
  function bindWidgetCopy(button, labelKey, getValue, sourceInput) {
    let feedback = labelKey, timer;
    const update = () => {
      const label = boxLabels[feedback] || "";
      if (button.textContent !== label) button.textContent = label;
      button.dataset.feedback = feedback;
    };
    button.setAttribute("aria-live", "polite");
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", async () => {
      const copied = await copyWidgetText(getValue(), sourceInput);
      feedback = copied ? "copied" : "copyFailed";
      clearTimeout(timer); update();
      timer = setTimeout(() => { feedback = labelKey; update(); }, 1500);
    });
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
    const updateHeader = createWidgetHeader(box, "textboxType", ["M5 4h14", "M12 4v16", "M8 20h8"], actions);
    const mirror = document.createElement("pre");
    mirror.className = "htnote-textbox-print";
    mirror.setAttribute("aria-hidden", "true");
    const updateCopy = bindWidgetCopy(copy, "copy", () => input.value, input);
    const update = () => {
      updateHeader();
      updateCopy();
      if (reset.textContent !== (boxLabels.reset || "")) reset.textContent = boxLabels.reset || "";
      reset.disabled = input.value === input.defaultValue;
      // Aynı metin gözlemci döngüsü oluşturmasın.
      if (mirror.textContent !== input.value) mirror.textContent = input.value;
      if (!window.CSS?.supports?.("field-sizing", "content")) {
        input.style.height = "auto";
        input.style.height = `${Math.max(input.scrollHeight, 3 * (parseFloat(getComputedStyle(input).lineHeight) || 21))}px`;
      }
    };
    reset.addEventListener("click", () => { input.value = input.defaultValue; update(); });
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
    const updateHeader = createWidgetHeader(box, "checklistType", ["m3 5 2 2 4-4", "M13 6h8", "m3 12 2 2 4-4", "M13 13h8", "M5 20h.01", "M13 20h8"], actions);
    const summary = document.createElement("div"), counter = document.createElement("span"), progress = document.createElement("div"), fill = document.createElement("div");
    summary.className = "htnote-checklist-summary";
    counter.dataset.testid = "checklist-counter";
    progress.className = "htnote-checklist-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuemin", "0");
    progress.append(fill); summary.append(counter, progress); list.before(summary);
    const inputs = () => Array.from(list.querySelectorAll('li > label > input[type="checkbox"]'));
    const updateCopy = bindWidgetCopy(copy, "copyRemaining", () => inputs().filter((input) => !input.checked).map((input) => input.parentElement.textContent.replace(/^ /, "")).join("\n"));
    const update = () => {
      updateHeader();
      const rows = inputs(), count = rows.filter((input) => input.checked).length;
      const value = `${count} / ${rows.length}`;
      if (counter.textContent !== value) counter.textContent = value;
      progress.setAttribute("aria-valuemax", String(rows.length));
      progress.setAttribute("aria-valuenow", String(count));
      progress.setAttribute("aria-label", boxLabels.checklistProgress || "");
      fill.style.width = `${rows.length ? count / rows.length * 100 : 0}%`;
      rows.forEach((input) => {
        // Yalnız geçici durum sınıfı değişir; checked özniteliğine dokunulmaz.
        input.parentElement.classList.toggle("htnote-checklist-done", input.checked);
      });
      reset.disabled = rows.every((input) => input.checked === input.defaultChecked);
      if (reset.textContent !== (boxLabels.checklistReset || "")) reset.textContent = boxLabels.checklistReset || "";
      updateCopy();
    };
    reset.addEventListener("click", () => { inputs().forEach((input) => { input.checked = input.defaultChecked; }); update(); });
    list.addEventListener("change", update);
    checklists.set(box, { update });
    update();
  }
  function scanWidgets(node) {
    if (node.nodeType !== 1) return;
    for (const [kind, enhance] of [["textbox", enhanceTextBox], ["checklist", enhanceChecklist]]) {
      const selector = `[data-htnote-widget="${kind}"]`;
      if (node.matches(selector)) enhance(node);
      node.querySelectorAll(selector).forEach(enhance);
    }
  }
  function updateWidgets() {
    document.querySelectorAll('[data-htnote-widget]').forEach((box) => {
      textBoxes.get(box)?.update(); checklists.get(box)?.update();
    });
  }
  scanWidgets(root);
  new MutationObserver((records) => records.forEach((record) => {
    record.addedNodes.forEach(scanWidgets);
    const box = record.target.nodeType === 1 ? record.target.closest('[data-htnote-widget]') : record.target.parentElement?.closest('[data-htnote-widget]');
    if (box) { scanWidgets(box); textBoxes.get(box)?.update(); checklists.get(box)?.update(); }
  })).observe(root, { childList: true, subtree: true, characterData: true });
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
      for (const key of ["copy", "copied", "copyFailed", "reset", "textboxType", "checklistType", "checklistReset", "copyRemaining", "checklistProgress"]) {
        if (typeof widgetLabels[key] === "string" && widgetLabels[key].length <= 200) boxLabels[key] = widgetLabels[key];
      }
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
