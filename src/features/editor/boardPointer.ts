import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { activeBoard, boardAtCell } from "./boardNodes";
import { boardPointerTarget, boardResizeTarget, boardTargetLayout, type BoardGrid, type BoardTarget, type CellLayout } from "./board";
import { mediaToolbarOwners } from "./mediaToolbarPosition";
import { clipPointerLayer, type installBlockPointer } from "./blockPointer";
import { editorViewport } from "./editorViewport";

type Mode = "move" | "left" | "right";
interface PreviewCell extends CellLayout { dom: HTMLElement; style: string; original: number }
interface Drag {
  pointerId: number; mode: Mode; pos: number; index: number; doc: ProseMirrorNode; board: HTMLElement;
  cells: PreviewCell[]; grid: BoardGrid; startX: number; startY: number; x: number; y: number;
  target: BoardTarget; bounds: DOMRect; rects: DOMRect[]; remeasure: boolean; capture: HTMLElement;
}

// Tek ortak katman ve editör düzeyinde tek hover dinleyicisi; hücrelerde abonelik yoktur.
export function installBoardPointer(editor: Editor, layer: HTMLElement, ghost: HTMLElement, label: HTMLElement, blocks?: ReturnType<typeof installBlockPointer>) {
  const view = editor.view;
  let anchor: HTMLElement | null = null;
  let hovered: HTMLElement | null = null;
  let hoverTarget: Element | null | undefined;
  let drag: Drag | null = null;
  let raf = 0;
  let hoverX = -Infinity;
  mediaToolbarOwners.set(layer, view.dom);
  const restore = (current: Drag) => current.cells.forEach((cell) => cell.dom.setAttribute("style", cell.style));
  const measure = (current: Drag) => {
    const board = current.board.getBoundingClientRect();
    const css = getComputedStyle(current.board);
    const gap = parseFloat(css.columnGap) || 16;
    const left = board.left + (parseFloat(css.paddingLeft) || 0) + (parseFloat(css.borderLeftWidth) || 0);
    const width = board.width - (left - board.left) - (parseFloat(css.paddingRight) || 0) - (parseFloat(css.borderRightWidth) || 0);
    const step = (width + gap) / 12;
    const rows = new Map<number, { row: number; top: number; bottom: number }>();
    const rects = current.cells.map((cell) => cell.dom.getBoundingClientRect());
    current.cells.forEach((cell, i) => {
      const previous = rows.get(cell.row);
      rows.set(cell.row, { row: cell.row, top: Math.min(previous?.top ?? Infinity, rects[i].top), bottom: Math.max(previous?.bottom ?? -Infinity, rects[i].bottom) });
    });
    if (current.grid.rows.length) {
      // Kaydırma sırasında grip işaretçinin altında kalır.
      current.startX += rects[current.index].left - current.bounds.left;
      current.startY += rects[current.index].top - current.bounds.top;
    }
    current.grid = { edges: Array.from({ length: 13 }, (_, i) => left + i * step - (i === 12 ? gap : 0)), gap,
      rows: [...rows.values()].sort((a, b) => a.row - b.row) };
    current.bounds = rects[current.index];
    current.rects = rects;
    current.remeasure = false;
  };
  const position = () => {
    if (blocks?.isDragging()) { layer.hidden = true; return; }
    if (hoverTarget !== undefined) {
      const target = hoverTarget?.closest<HTMLElement>(".htnote-board-cell");
      hovered = target && view.dom.contains(target) ? target : null;
      hoverTarget = undefined;
    }
    const selected = activeBoard(editor.state);
    const dom = selected ? view.nodeDOM(selected.cellPos) : null;
    anchor = hovered?.isConnected ? hovered : dom instanceof HTMLElement ? dom : null;
    const bounds = anchor?.getBoundingClientRect();
    const clip = editorViewport(view.dom.closest(".htnote-visual-scroll"));
    // Bütün okumalar bitti; ortak katmanın yerleşimini şimdi yaz.
    if (!bounds || !editor.isEditable || clip && (bounds.bottom <= clip.top || bounds.top >= clip.bottom)) { layer.hidden = true; return; }
    layer.hidden = false;
    layer.style.left = `${bounds.left}px`; layer.style.top = `${bounds.top}px`;
    layer.style.width = `${bounds.width}px`; layer.style.height = `${bounds.height}px`;
    clipPointerLayer(layer, bounds, clip, 12);
    layer.querySelectorAll<HTMLElement>(".htnote-board-resize-handle").forEach((handle) => { handle.style.visibility = Math.min(Math.abs(hoverX - bounds.left), Math.abs(hoverX - bounds.right)) <= 10 ? "visible" : "hidden"; });
  };
  const preview = () => {
    if (!drag) { position(); return; }
    const current = drag;
    if (current.remeasure) measure(current);
    const cell = current.cells[current.index];
    // Tıklama veya aynı sütunda küçük hareket araya satır açmamalı.
    current.target = Math.hypot(current.x - current.startX, current.y - current.startY) < 3
      ? { col: cell.col, span: cell.span, row: cell.row, insertRow: false }
      : current.mode === "move" ? boardPointerTarget(current.x, current.y, cell, current.grid)
        : boardResizeTarget(current.x, current.mode, cell, current.grid);
    const ordered = boardTargetLayout(current.cells, current.index, current.target);
    const moved = ordered.find((entry) => entry.original === current.index)!;
    const row = current.grid.rows[moved.row - 1];
    const last = current.grid.rows[current.grid.rows.length - 1];
    const left = current.grid.edges[moved.col - 1];
    const right = current.grid.edges[moved.col + moved.span - 1] - (moved.col + moved.span < 13 ? current.grid.gap : 0);
    const rowTops: number[] = [current.grid.rows[0].top];
    const heights: number[] = [];
    for (const entry of ordered) heights[entry.row - 1] = Math.max(heights[entry.row - 1] ?? 0, current.rects[entry.original].height);
    for (let i = 1; i < heights.length; i++) rowTops[i] = rowTops[i - 1] + heights[i - 1] + current.grid.gap;
    const top = current.mode === "move" ? rowTops[moved.row - 1] : row?.top ?? last.bottom + current.grid.gap;
    const height = current.bounds.height;
    const clip = editorViewport(view.dom.closest(".htnote-visual-scroll"));
    // Önizleme yalnız stillerde tutulur; ProseMirror belge geçmişine girmez.
    for (const entry of ordered) {
      if (current.mode === "move") {
        if (entry.original !== current.index) entry.dom.style.transform = `translateY(${rowTops[entry.row - 1] - current.rects[entry.original].top}px)`;
        continue;
      }
      entry.dom.style.gridColumn = `${entry.col} / span ${entry.span}`;
      entry.dom.style.gridRow = String(entry.row);
    }
    if (current.mode === "move") {
      cell.dom.style.transform = `translate(${current.x - current.startX}px, ${current.y - current.startY}px)`;
      cell.dom.style.opacity = "0.55"; cell.dom.style.zIndex = "1";
    }
    ghost.hidden = false;
    ghost.style.left = `${left}px`; ghost.style.top = `${top}px`;
    ghost.style.width = `${right - left}px`; ghost.style.height = `${height}px`;
    clipPointerLayer(ghost, { left, top, right, bottom: top + height }, clip);
    label.hidden = current.mode === "move";
    label.textContent = `${moved.span}/12`;
    label.style.left = `${left}px`; label.style.top = `${top}px`;
    clipPointerLayer(label, { left, top, right: left + 60, bottom: top + 24 }, clip);
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; preview(); });
  };
  const end = (commit: boolean) => {
    if (!drag) return;
    const current = drag;
    cancelAnimationFrame(raf); raf = 0;
    if (commit) preview();
    restore(current);
    drag = null;
    ghost.hidden = true; label.hidden = true;
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", up, true);
    document.removeEventListener("pointercancel", cancel, true);
    if (current.capture.hasPointerCapture(current.pointerId)) current.capture.releasePointerCapture(current.pointerId);
    if (commit && editor.state.doc === current.doc) editor.commands.setBoardCellLayout(current.pos, current.target);
    hovered = null; schedule();
  };
  const hover = (event: PointerEvent) => {
    blocks?.hover(event); hoverX = event.clientX;
    if (drag) return;
    hoverTarget = event.target instanceof Element ? event.target : null;
    schedule();
  };
  const leave = (event: PointerEvent) => {
    blocks?.leave(event);
    if (event.relatedTarget instanceof Node && layer.contains(event.relatedTarget)) return;
    hoverTarget = null; if (!drag) schedule();
  };
  const down = (event: PointerEvent) => {
    const handle = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-board-handle]") : null;
    if (!handle || !anchor || drag || event.button !== 0 || !editor.isEditable) return;
    const pos = view.posAtDOM(anchor, 0) - 1;
    const active = boardAtCell(editor.state, pos);
    const board = anchor.parentElement;
    if (!active || !board) return;
    const cells: PreviewCell[] = [];
    let cellPos = active.boardPos + 1;
    active.board.forEach((node, _offset, original) => {
      const dom = view.nodeDOM(cellPos);
      if (dom instanceof HTMLElement) cells.push({ col: node.attrs.col, span: node.attrs.span, row: node.attrs.row, dom, style: dom.getAttribute("style") ?? "", original });
      cellPos += node.nodeSize;
    });
    if (cells.length !== active.board.childCount) return;
    event.preventDefault(); event.stopPropagation();
    drag = { pointerId: event.pointerId, mode: handle.dataset.boardHandle as Mode, pos, index: active.index, doc: editor.state.doc,
      board, cells, grid: { edges: [], rows: [], gap: 16 }, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      target: { col: active.cell.attrs.col, span: active.cell.attrs.span, row: active.cell.attrs.row, insertRow: false }, bounds: new DOMRect(), rects: [], remeasure: true, capture: handle };
    // Başlangıçta bir kez oku, hareket karelerinde önbelleği kullan.
    measure(drag);
    handle.setPointerCapture(event.pointerId);
    // WebDriver/Windows ayrı action çağrılarında capture'ı korumayabilir.
    // Sürükleme boyunca bu üç ortak dinleyici aynı belgedeki olayları da yakalar.
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
  };
  const move = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY; schedule();
  };
  const up = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY; end(true);
  };
  const cancel = (event: PointerEvent) => { if (drag?.pointerId === event.pointerId) end(false); };
  const escape = (event: KeyboardEvent) => {
    if (drag && event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); end(false); }
  };
  const scroll = () => {
    if (drag) { restore(drag); drag.remeasure = true; }
    schedule();
  };
  const update = () => {
    if (drag && editor.state.doc !== drag.doc) end(false);
    if (!drag) schedule();
  };
  view.dom.addEventListener("pointermove", hover);
  view.dom.addEventListener("pointerleave", leave);
  layer.addEventListener("pointerdown", down);
  layer.addEventListener("pointerleave", leave);
  layer.addEventListener("lostpointercapture", cancel);
  document.addEventListener("keydown", escape, true);
  document.addEventListener("scroll", scroll, true);
  window.addEventListener("resize", scroll);
  editor.on("transaction", update);
  schedule();
  return () => {
    end(false); cancelAnimationFrame(raf);
    mediaToolbarOwners.delete(layer);
    view.dom.removeEventListener("pointermove", hover); view.dom.removeEventListener("pointerleave", leave);
    layer.removeEventListener("pointerdown", down); layer.removeEventListener("pointerleave", leave); layer.removeEventListener("lostpointercapture", cancel);
    document.removeEventListener("keydown", escape, true); document.removeEventListener("scroll", scroll, true);
    window.removeEventListener("resize", scroll); editor.off("transaction", update);
  };
}
