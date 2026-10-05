import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { blockAt, blockMoveTransaction, selectBlock, validBlockTarget, widgetBlocks, type BlockRange, type BlockTarget } from "./blockMove";
import { MAX_BOARD_CELLS, boardPointerTarget, type BoardGrid, type CellLayout } from "./board";
import { mediaToolbarOwners } from "./mediaToolbarPosition";
import { dispatchBlockMove } from "./blockMovement";

interface Hit { range: BlockRange; dom: HTMLElement }
interface Destination { target: BlockTarget; rect: { left: number; top: number; width: number; height: number }; edge?: boolean }
interface Drag { source: Hit; doc: ProseMirrorNode; id: number; capture: HTMLElement; x: number; y: number; startX: number; startY: number; moved: boolean; target: Destination | null }

// Aynı kırpma tüm sabit katmanlarda kullanılır; taşan grip yalnız kaydırma alanı içinde görünür.
export function clipPointerLayer(layer: HTMLElement, bounds: { left: number; top: number; right: number; bottom: number }, clip: DOMRect | undefined, allowance = 0) {
  layer.style.clipPath = clip ? `inset(${Math.max(-allowance, clip.top - bounds.top)}px ${Math.max(-allowance, bounds.right - clip.right)}px ${Math.max(-allowance, bounds.bottom - clip.bottom)}px ${Math.max(-allowance, clip.left - bounds.left)}px)` : "";
}
export function installBlockPointer(editor: Editor, layer: HTMLElement, handle: HTMLElement, chip: HTMLElement, indicator: HTMLElement, hint: HTMLElement) {
  const view = editor.view;
  const scroll = view.dom.closest<HTMLElement>(".htnote-visual-scroll");
  let hovered: Hit | null = null, drag: Drag | null = null, raf = 0;
  let hoverEvent: { element: Element | null; x: number; y: number } | null = null;
  let suppressClick = false;
  const sourceStyle = document.createElement("style"); layer.append(sourceStyle);
  mediaToolbarOwners.set(layer, view.dom);
  const fromElement = (element: Element | null): Hit | null => {
    if (!element || !view.dom.contains(element)) return null;
    let dom = element as HTMLElement;
    while (dom.parentElement && dom.parentElement !== view.dom && !dom.parentElement.classList.contains("htnote-board-cell")) dom = dom.parentElement;
    if (dom === view.dom || dom.classList.contains("htnote-board-cell")) return null;
    try {
      const range = blockAt(view.state.doc, view.posAtDOM(dom, 0));
      const nodeDOM = range && view.nodeDOM(range.from);
      return range && nodeDOM instanceof HTMLElement ? { range, dom: nodeDOM } : null;
    } catch { return null; }
  };
  const gridDestination = (board: HTMLElement, x: number, y: number): Destination | null => {
    const pos = view.posAtDOM(board, 0) - 1, node = view.state.doc.nodeAt(pos);
    if (!node || node.childCount >= MAX_BOARD_CELLS) return null;
    const bounds = board.getBoundingClientRect(), css = getComputedStyle(board), gap = parseFloat(css.columnGap) || 16;
    const left = bounds.left + (parseFloat(css.paddingLeft) || 0);
    const width = bounds.width - (parseFloat(css.paddingLeft) || 0) - (parseFloat(css.paddingRight) || 0);
    const step = (width + gap) / 12;
    const cells = Array.from(board.children).map((dom, index) => ({ dom, cell: node.child(index), rect: dom.getBoundingClientRect() }));
    const rows = new Map<number, { row: number; top: number; bottom: number }>();
    cells.forEach(({ cell, rect }) => { const row = cell.attrs.row, previous = rows.get(row); rows.set(row, { row, top: Math.min(previous?.top ?? Infinity, rect.top), bottom: Math.max(previous?.bottom ?? -Infinity, rect.bottom) }); });
    const grid: BoardGrid = { edges: Array.from({ length: 13 }, (_, i) => left + i * step - (i === 12 ? gap : 0)), gap, rows: [...rows.values()].sort((a, b) => a.row - b.row) };
    const pointer = boardPointerTarget(x, y, { col: 1, span: 1, row: 1 }, grid);
    let col = pointer.col, end = 13;
    if (!pointer.insertRow) {
      const occupied = cells.filter(({ cell }) => cell.attrs.row === pointer.row);
      if (occupied.some(({ cell }) => col >= cell.attrs.col && col < cell.attrs.col + cell.attrs.span)) return null;
      col = Math.max(1, ...occupied.filter(({ cell }) => cell.attrs.col + cell.attrs.span <= col).map(({ cell }) => cell.attrs.col + cell.attrs.span));
      end = Math.min(13, ...occupied.filter(({ cell }) => cell.attrs.col > col).map(({ cell }) => cell.attrs.col));
    }
    const layout: CellLayout = { col, span: Math.min(6, end - col), row: pointer.row };
    const row = grid.rows.find((entry) => entry.row === layout.row);
    const top = pointer.insertRow ? (row?.top ?? grid.rows[grid.rows.length - 1].bottom + gap) : row!.top;
    return { target: { kind: "grid", board: pos, layout, insertRow: pointer.insertRow }, rect: { left: grid.edges[col - 1], top, width: step * layout.span - gap, height: row && !pointer.insertRow ? row.bottom - row.top : 48 } };
  };
  const destination = (current: Drag, clip: DOMRect | undefined): Destination | null => {
    const { x, y } = current;
    if (clip && (x < clip.left || x > clip.right || y < clip.top || y > clip.bottom)) return null;
    const coordinates = view.posAtCoords({ left: x, top: y });
    const element = document.elementFromPoint(x, y);
    if (element?.closest(".htnote-editor-toolbar")) return null;
    const board = element?.closest<HTMLElement>(".htnote-board");
    const cell = element?.closest<HTMLElement>(".htnote-board-cell");
    if (board && !cell && current.source.range.node.type.name !== "board") {
      const target = gridDestination(board, x, y);
      if (target && validBlockTarget(view.state.doc, current.source.range, target.target)) return target;
    }
    let hit = fromElement(element);
    if (!hit && coordinates) {
      const range = blockAt(view.state.doc, coordinates.pos);
      const dom = range && view.nodeDOM(range.from);
      if (range && dom instanceof HTMLElement) hit = { range, dom };
    }
    if (!hit) {
      const last = view.dom.lastElementChild;
      if (!last) return null;
      const bounds = last.getBoundingClientRect();
      return y >= bounds.bottom ? { target: { kind: "between", pos: view.state.doc.content.size }, rect: { left: bounds.left, top: bounds.bottom, width: bounds.width, height: 2 } } : null;
    }
    let { range, dom } = hit;
    if (current.source.range.node.type.name === "board" && range.board !== null) {
      range = blockAt(view.state.doc, range.board)!; dom = view.nodeDOM(range.from) as HTMLElement;
    }
    const bounds = dom.getBoundingClientRect();
    const edgeWidth = Math.max(40, bounds.width * 0.2);
    const side = x < bounds.left + edgeWidth ? "left" : x > bounds.right - edgeWidth ? "right" : null;
    // Üst/alt boşluk yatay hedef olarak kalır; kenar hedefi bloğun gövdesindedir.
    if (side && y >= bounds.top + 4 && y <= bounds.bottom - 4 && range.node.type.name !== "board" && current.source.range.node.type.name !== "board") {
      const target: BlockTarget = range.container === -1 ? { kind: "edge", block: range.from, side } : { kind: "cellEdge", cell: range.container, side };
      if (validBlockTarget(view.state.doc, current.source.range, target)) return { target, edge: true, rect: { left: side === "left" ? bounds.left : bounds.right - 2, top: bounds.top, width: 2, height: bounds.height } };
    }
    const after = y > (bounds.top + bounds.bottom) / 2;
    const target: BlockTarget = { kind: "between", pos: after ? range.to : range.from };
    return validBlockTarget(view.state.doc, current.source.range, target) ? { target, rect: { left: bounds.left, top: after ? bounds.bottom : bounds.top, width: bounds.width, height: 2 } } : null;
  };
  const draw = () => {
    const clip = scroll?.getBoundingClientRect();
    if (!drag) {
      const point = hoverEvent;
      if (point) hovered = fromElement(point.element);
      const bounds = hovered?.dom.getBoundingClientRect();
      const cell = hovered?.dom.closest(".htnote-board-cell")?.getBoundingClientRect();
      const visible = !!bounds && editor.isEditable && !widgetBlocks.has(hovered!.range.node.type.name) && (!clip || bounds.bottom > clip.top && bounds.top < clip.bottom)
        && (!cell || !point || point.x > cell.left + 10 && point.x < cell.right - 10);
      // Okumalar tamamlandı; tek paylaşılan tutamağı şimdi konumlandır.
      layer.hidden = !visible;
      layer.style.visibility = "";
      if (visible) {
        const left = cell ? cell.left + 9 : bounds!.left - 22;
        const top = bounds!.top;
        Object.assign(layer.style, { left: `${left}px`, top: `${top}px`, width: "18px", height: "24px" });
        clipPointerLayer(layer, { left, top, right: left + 18, bottom: top + 24 }, clip);
      }
      return;
    }
    const current = drag;
    if (Math.hypot(current.x - current.startX, current.y - current.startY) >= 4) current.moved = true;
    current.target = current.moved ? destination(current, clip) : null;
    const speed = clip && current.y < clip.top + 44 ? -Math.ceil((clip.top + 44 - current.y) / 5)
      : clip && current.y > clip.bottom - 44 ? Math.ceil((current.y - clip.bottom + 44) / 5) : 0;
    const scrollTop = scroll?.scrollTop ?? 0;
    const target = current.target;
    // Belge/DOM klonu yok; çip ve kaynak opaklığı yalnız geçici boyamadır.
    // Capture tutamağının ölçüsü sabit kalır; WebDriver ayrı action çağrılarında
    // aynı element origin'ini kullanır. Görünmez tutamak hedef hit-test'ine girmez.
    layer.hidden = current.capture !== handle; layer.style.visibility = "hidden"; chip.hidden = !current.moved;
    view.dom.classList.toggle("htnote-block-drag-active", current.moved);
    const chipLeft = Math.max(clip?.left ?? 0, Math.min(current.x + 14, (clip?.right ?? window.innerWidth) - 200));
    const chipTop = Math.max(clip?.top ?? 0, Math.min(current.y + 14, (clip?.bottom ?? window.innerHeight) - 32));
    Object.assign(chip.style, { left: `${chipLeft}px`, top: `${chipTop}px` });
    clipPointerLayer(chip, { left: chipLeft, top: chipTop, right: chipLeft + 200, bottom: chipTop + 32 }, clip);
    indicator.hidden = !target; hint.hidden = !target?.edge;
    if (target) {
      const rect = target.rect;
      Object.assign(indicator.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      indicator.dataset.kind = target.target.kind;
      clipPointerLayer(indicator, { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }, clip);
      const left = Math.max(clip?.left ?? 0, Math.min(rect.left + 6, (clip?.right ?? window.innerWidth) - 120));
      Object.assign(hint.style, { left: `${left}px`, top: `${rect.top}px` });
      clipPointerLayer(hint, { left, top: rect.top, right: left + 120, bottom: rect.top + 28 }, clip);
    }
    if (speed && scroll) { scroll.scrollTop += Math.max(-18, Math.min(18, speed)); if (scroll.scrollTop !== scrollTop) schedule(); }
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  const end = (commit: boolean) => {
    if (!drag) return;
    const current = drag;
    cancelAnimationFrame(raf); raf = 0;
    if (commit) draw();
    drag = null; cancelAnimationFrame(raf); raf = 0;
    view.dom.classList.remove("htnote-block-drag-active"); sourceStyle.textContent = "";
    chip.hidden = true; indicator.hidden = true; hint.hidden = true;
    document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerup", up, true); document.removeEventListener("pointercancel", cancel, true);
    editor.off("transaction", update);
    document.removeEventListener("keydown", escape, true);
    current.capture.removeEventListener("lostpointercapture", cancel);
    if (current.capture.hasPointerCapture(current.id)) current.capture.releasePointerCapture(current.id);
    if (commit && view.state.doc === current.doc) {
      if (!current.moved) dispatchBlockMove(editor, selectBlock(view.state.tr, current.source.range.from));
      else if (current.target) { const tr = blockMoveTransaction(view.state, current.source.range, current.target.target); if (tr) dispatchBlockMove(editor, tr); }
    }
    hovered = null; hoverEvent = null; layer.hidden = true; layer.style.visibility = "";
  };
  const down = (event: PointerEvent) => {
    const capture = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-block-handle],.htnote-widget-handle") : null;
    if (!capture || event.button !== 0 || drag || !editor.isEditable) return;
    const source = capture === handle ? hovered && fromElement(hovered.dom) : fromElement(capture);
    if (!source) return;
    suppressClick = true;
    event.preventDefault(); event.stopImmediatePropagation();
    drag = { source, doc: view.state.doc, id: event.pointerId, capture, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, target: null };
    const $pos = view.state.doc.resolve(source.range.from);
    const selector = source.range.container === -1 ? `> :nth-child(${$pos.index() + 1})`
      : `> :nth-child(${$pos.index(0) + 1}) > :nth-child(${$pos.index(1) + 1}) > :nth-child(${$pos.index(2) + 1})`;
    // Kaynak öznitelikleri değişmez: DOMObserver ham HTML'e geçici stil yazamaz.
    sourceStyle.textContent = `.htnote-block-drag-active ${selector} { opacity: 0.45; }`;
    const node = source.range.node, attrs = node.attrs;
    chip.querySelector("[data-block-preview]")!.textContent = String(node.textContent || attrs.title || attrs.content || attrs.items?.[0]?.text || attrs.fields?.[0]?.value || attrs.alt || attrs.src || attrs.html || "").slice(0, 40);
    chip.dataset.type = source.range.node.type.name;
    capture.setPointerCapture(event.pointerId);
    capture.addEventListener("lostpointercapture", cancel);
    document.addEventListener("pointermove", move, true); document.addEventListener("pointerup", up, true); document.addEventListener("pointercancel", cancel, true);
    editor.on("transaction", update);
    document.addEventListener("keydown", escape, true);
  };
  const move = (event: PointerEvent) => { if (drag?.id === event.pointerId) { drag.x = event.clientX; drag.y = event.clientY; schedule(); } };
  const up = (event: PointerEvent) => { if (drag?.id === event.pointerId) { drag.x = event.clientX; drag.y = event.clientY; end(true); } };
  const cancel = (event: PointerEvent) => { if (drag?.id === event.pointerId) end(false); };
  const escape = (event: KeyboardEvent) => { if (drag && event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); end(false); } };
  const refresh = () => { if (drag || hovered) schedule(); };
  const update = () => { if (drag && view.state.doc !== drag.doc) end(false); };
  const nativeDrag = (event: DragEvent) => { if (event.target instanceof Element && event.target.closest(".htnote-widget-handle,.htnote-media-node,.htnote-html-block")) event.preventDefault(); };
  const click = (event: MouseEvent) => { if (suppressClick && event.target instanceof Element && event.target.closest("[data-block-handle]")) { event.preventDefault(); event.stopImmediatePropagation(); } suppressClick = false; };
  const selectKey = (event: KeyboardEvent) => { if (hovered && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); dispatchBlockMove(editor, selectBlock(view.state.tr, hovered.range.from)); } };
  const leave = (event: PointerEvent) => { if (!drag && !(event.relatedTarget instanceof Node && view.dom.contains(event.relatedTarget))) { hovered = null; hoverEvent = null; layer.hidden = true; } };
  layer.addEventListener("keydown", selectKey);
  layer.addEventListener("pointerleave", leave);
  view.dom.addEventListener("pointerdown", down, true); layer.addEventListener("pointerdown", down, true);
  view.dom.addEventListener("dragstart", nativeDrag, true);
  view.dom.addEventListener("click", click, true); layer.addEventListener("click", click, true);
  document.addEventListener("scroll", refresh, true); window.addEventListener("resize", refresh);
  return {
    isDragging: () => !!drag,
    hover(event: PointerEvent) { if (!drag) { hoverEvent = { element: event.target instanceof Element ? event.target : null, x: event.clientX, y: event.clientY }; schedule(); } },
    leave(event: PointerEvent) { if (!drag && !(event.relatedTarget instanceof Node && layer.contains(event.relatedTarget))) { hoverEvent = { element: null, x: 0, y: 0 }; schedule(); } },
    destroy() {
      end(false); cancelAnimationFrame(raf); mediaToolbarOwners.delete(layer);
      sourceStyle.remove();
      layer.removeEventListener("keydown", selectKey);
      layer.removeEventListener("pointerleave", leave);
      view.dom.removeEventListener("pointerdown", down, true); layer.removeEventListener("pointerdown", down, true); view.dom.removeEventListener("dragstart", nativeDrag, true);
      view.dom.removeEventListener("click", click, true); layer.removeEventListener("click", click, true);
      document.removeEventListener("keydown", escape, true); document.removeEventListener("scroll", refresh, true); window.removeEventListener("resize", refresh); editor.off("transaction", update);
    },
  };
}
