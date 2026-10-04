export function scrollbarGeometry(viewport: number, content: number, position: number) {
  const length = Math.min(viewport, Math.max(24, viewport * viewport / Math.max(content, 1)));
  const travel = Math.max(0, viewport - length);
  const range = Math.max(0, content - viewport);
  return { length, travel, range, offset: range ? Math.max(0, Math.min(range, position)) / range * travel : 0 };
}

export function scrollFromDrag(start: number, delta: number, range: number, travel: number) {
  return Math.max(0, Math.min(range, start + (travel ? delta * range / travel : 0)));
}

// Ana belge taranır; iframe belgelerine ve yerel kaydırma olaylarına müdahale edilmez.
export function installOverlayScrollbars(): () => void {
  const layer = document.createElement("div");
  layer.dataset.overlayScrollbars = "true";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);
  type Ancestors = { stacking: number; clip: { left: number; top: number; right: number; bottom: number } };
  type Entry = { element: HTMLElement; observed: Set<Element>; tracks: HTMLDivElement[]; ancestors?: Ancestors; hover: boolean; dragging: boolean; active: boolean; timer?: ReturnType<typeof setTimeout>; cleanup: () => void };
  const entries = new Map<HTMLElement, Entry>();
  let frame = 0;
  let needsScan = true;
  const scanRoots = new Set<HTMLElement>([document.body]);
  const excluded = '[contenteditable="true"], .ProseMirror, .cm-content, .cm-line, [data-overlay-scrollbars]';
  const pending = new Set<Entry>();
  let updateAll = false;
  const requestUpdate = () => { if (!frame) frame = requestAnimationFrame(update); };
  const schedule = () => { updateAll = true; requestUpdate(); };
  const scheduleEntry = (entry: Entry) => { pending.add(entry); requestUpdate(); };
  const resize = new ResizeObserver(schedule);
  function visible(entry: Entry) {
    entry.tracks.forEach((track) => { track.dataset.visible = String(entry.hover || entry.dragging || entry.active); });
  }
  function attach(element: HTMLElement) {
    const entry: Entry = { element, observed: new Set([element]), tracks: [], hover: false, dragging: false, active: false, cleanup: () => {} };
    const enter = () => { entry.hover = true; visible(entry); scheduleEntry(entry); };
    const leave = () => { entry.hover = false; visible(entry); };
    element.addEventListener("pointerenter", enter);
    element.addEventListener("pointerleave", leave);
    entry.cleanup = () => {
      pending.delete(entry);
      clearTimeout(entry.timer);
      element.removeEventListener("pointerenter", enter);
      element.removeEventListener("pointerleave", leave);
      entry.observed.forEach((child) => resize.unobserve(child));
      entry.tracks.forEach((track) => track.remove());
    };
    for (const axis of ["y", "x"] as const) {
      const track = document.createElement("div");
      track.className = "htnote-overlay-scrollbar";
      track.dataset.axis = axis;
      const thumb = document.createElement("div");
      thumb.className = "htnote-overlay-thumb";
      track.append(thumb);
      layer.append(track);
      entry.tracks.push(track);
      track.addEventListener("pointerenter", enter);
      track.addEventListener("pointerleave", leave);
      // Portal tutamağının üzerindeki tekerlek de ait olduğu yerel kabı kaydırır.
      track.addEventListener("wheel", (event) => {
        const unit = event.deltaMode === 1 ? parseFloat(getComputedStyle(element).lineHeight) || 16
          : event.deltaMode === 2 ? (axis === "y" ? element.clientHeight : element.clientWidth) : 1;
        element.scrollBy({ left: (axis === "x" ? event.deltaX || event.deltaY : event.deltaX) * unit,
          top: axis === "y" ? event.deltaY * unit : 0, behavior: "instant" });
      }, { passive: true });
      let startPointer = 0;
      let startScroll = 0;
      thumb.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        entry.dragging = true;
        startPointer = axis === "y" ? event.clientY : event.clientX;
        startScroll = axis === "y" ? element.scrollTop : element.scrollLeft;
        thumb.setPointerCapture(event.pointerId);
        visible(entry);
      });
      thumb.addEventListener("pointermove", (event) => {
        if (!entry.dragging) return;
        const geometry = scrollbarGeometry(axis === "y" ? element.clientHeight : element.clientWidth, axis === "y" ? element.scrollHeight : element.scrollWidth, startScroll);
        const position = scrollFromDrag(startScroll, (axis === "y" ? event.clientY : event.clientX) - startPointer, geometry.range, geometry.travel);
        if (axis === "y") element.scrollTop = position;
        else element.scrollLeft = position;
        scheduleEntry(entry);
      });
      const end = () => { entry.dragging = false; entry.hover = element.matches(":hover"); visible(entry); };
      thumb.addEventListener("lostpointercapture", end);
      thumb.addEventListener("pointerup", (event) => { if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId); end(); });
      thumb.addEventListener("pointercancel", end);
    }
    entries.set(element, entry);
    resize.observe(element);
    element.querySelectorAll(":scope > *").forEach((child) => { entry.observed.add(child); resize.observe(child); });
  }
  function update() {
    frame = 0;
    if (needsScan) {
      needsScan = false;
      entries.forEach((entry) => { entry.ancestors = undefined; });
      const candidates = new Set<HTMLElement>();
      scanRoots.forEach((root) => {
        if (!root.isConnected || root.closest(excluded)) return;
        candidates.add(root);
        // Hariç tutulan editör alt ağaçlarına hiç girilmez.
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
          acceptNode: (node) => (node as Element).matches(excluded) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
        });
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node instanceof HTMLElement) candidates.add(node);
        }
      });
      scanRoots.clear();
      candidates.forEach((element) => {
        if (layer.contains(element) || element === layer) return;
        const style = getComputedStyle(element);
        const scrollable = /^(auto|scroll)$/.test(style.overflowY) || /^(auto|scroll)$/.test(style.overflowX);
        if (scrollable && !entries.has(element)) attach(element);
        const entry = entries.get(element);
        if (entry && scrollable) {
          const children = new Set<Element>([element, ...element.children]);
          entry.observed.forEach((child) => { if (!children.has(child)) resize.unobserve(child); });
          children.forEach((child) => { if (!entry.observed.has(child)) resize.observe(child); });
          entry.observed = children;
        }
        if (!scrollable && entries.has(element)) { entries.get(element)!.cleanup(); entries.delete(element); }
      });
    }
    const updates = updateAll ? Array.from(entries.values()) : Array.from(pending);
    updateAll = false;
    pending.clear();
    for (const entry of updates) {
      const { element } = entry;
      if (entries.get(element) !== entry) continue;
      if (!element.isConnected) { entry.cleanup(); entries.delete(element); continue; }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const left = rect.left + element.clientLeft;
      const top = rect.top + element.clientTop;
      // Üst kapların kırpma sınırı, kapanan grupların tutamaklarını da gizler.
      // Ata hesapları tarama, pencere boyutu veya ata öznitelikleri değişene kadar saklanır.
      if (!entry.ancestors) {
        let stacking = 30;
        let clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const parentStyle = getComputedStyle(parent);
          const bounds = parent.getBoundingClientRect();
          stacking = Math.max(stacking, (parseInt(parentStyle.zIndex, 10) || 0) + 1);
          if (parentStyle.overflowX !== "visible") clip = { ...clip, left: Math.max(clip.left, bounds.left), right: Math.min(clip.right, bounds.right) };
          if (parentStyle.overflowY !== "visible") clip = { ...clip, top: Math.max(clip.top, bounds.top), bottom: Math.min(clip.bottom, bounds.bottom) };
        }
        entry.ancestors = { stacking, clip };
      }
      const { stacking, clip } = entry.ancestors;
      entry.tracks.forEach((track, index) => {
        const vertical = index === 0;
        const viewport = vertical ? element.clientHeight : element.clientWidth;
        const content = vertical ? element.scrollHeight : element.scrollWidth;
        const position = vertical ? element.scrollTop : element.scrollLeft;
        const geometry = scrollbarGeometry(viewport, content, position);
        const x = vertical ? left + element.clientWidth - 10 : left;
        const y = vertical ? top : top + element.clientHeight - 10;
        const width = vertical ? 10 : viewport;
        const height = vertical ? viewport : 10;
        track.style.display = /^(auto|scroll)$/.test(vertical ? style.overflowY : style.overflowX) && geometry.range > 1 && viewport > 0 && rect.width > 0 && style.visibility !== "hidden" ? "block" : "none";
        Object.assign(track.style, { zIndex: String(stacking), left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`,
          clipPath: `inset(${Math.max(0, clip.top - y)}px ${Math.max(0, x + width - clip.right)}px ${Math.max(0, y + height - clip.bottom)}px ${Math.max(0, clip.left - x)}px)` });
        const thumb = track.firstElementChild as HTMLElement;
        if (vertical) Object.assign(thumb.style, { top: `${geometry.offset}px`, height: `${geometry.length}px` });
        else Object.assign(thumb.style, { left: `${geometry.offset}px`, width: `${geometry.length}px` });
      });
    }
  }
  const mutations = new MutationObserver((records) => {
    let changed = false;
    records.forEach((record) => {
      if (layer.contains(record.target)) return;
      const target = record.target instanceof HTMLElement ? record.target : record.target.parentElement;
      if (!target) return;
      changed = true;
      if (record.type === "attributes") {
        entries.forEach((entry) => {
          if (target !== entry.element && target.contains(entry.element)) entry.ancestors = undefined;
        });
      }
      if (!target.closest(excluded)) { scanRoots.add(target); needsScan = true; }
    });
    if (!changed) return;
    schedule();
  });
  mutations.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden", "open"] });
  const scroll = (event: Event) => {
    const entry = entries.get(event.target as HTMLElement);
    if (entry) {
      entry.active = true;
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => { entry.active = false; visible(entry); }, 800);
      visible(entry);
      scheduleEntry(entry);
    }
  };
  document.addEventListener("scroll", scroll, { capture: true, passive: true });
  const resized = () => { scanRoots.add(document.body); needsScan = true; schedule(); };
  window.addEventListener("resize", resized);
  document.addEventListener("load", schedule, true);
  document.fonts?.addEventListener("loadingdone", schedule);
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    mutations.disconnect(); resize.disconnect();
    document.removeEventListener("scroll", scroll, true);
    window.removeEventListener("resize", resized);
    document.removeEventListener("load", schedule, true);
    document.fonts?.removeEventListener("loadingdone", schedule);
    entries.forEach((entry) => entry.cleanup());
    layer.remove();
  };
}
