import { Fragment, type Node } from "@tiptap/pm/model";
import { NodeSelection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { MAX_BOARD_CELLS, resolveLayout, validCell, type CellLayout } from "./board";

export const widgetBlocks = new Set(["textBox", "checklist", "copyfields", "template", "calc", "ipblock"]);
export interface BlockRange { from: number; to: number; node: Node; container: number; board: number | null }
export type BlockTarget =
  | { kind: "between"; pos: number }
  | { kind: "edge"; block: number; side: "left" | "right" }
  | { kind: "cellEdge"; cell: number; side: "left" | "right" }
  | { kind: "grid"; board: number; layout: CellLayout; insertRow: boolean };

// Yalnız doc/hücrenin doğrudan çocuğu; liste ve tablo iç öğeleri birlikte taşınır.
export function blockAt(doc: Node, pos: number): BlockRange | null {
  if (pos < 0 || pos > doc.content.size) return null;
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const parent = $pos.node(depth);
    if (parent.type.name !== "doc" && parent.type.name !== "boardCell") continue;
    const index = $pos.index(depth);
    const node = parent.maybeChild(index);
    if (!node) return null;
    const from = depth === $pos.depth ? pos : $pos.before(depth + 1);
    return { from, to: from + node.nodeSize, node, container: depth ? $pos.before(depth) : -1,
      board: depth ? $pos.before(depth - 1) : null };
  }
  return null;
}
function cellBoard(doc: Node, pos: number) {
  if (doc.nodeAt(pos)?.type.name !== "boardCell") return null;
  const $pos = doc.resolve(pos);
  return $pos.parent.type.name === "board" ? $pos.parent : null;
}
export function adjacentCellLayout(cells: readonly CellLayout[], index: number, side: "left" | "right") {
  const target = cells[index];
  if (!target || cells.length >= MAX_BOARD_CELLS) return null;
  const neighbors = cells.filter((cell, i) => i !== index && cell.row === target.row);
  const left = Math.max(1, ...neighbors.filter((cell) => cell.col < target.col).map((cell) => cell.col + cell.span));
  const right = Math.min(13, ...neighbors.filter((cell) => cell.col > target.col).map((cell) => cell.col));
  const gap = side === "left" ? target.col - left : right - target.col - target.span;
  if (gap > 0) {
    const span = Math.min(gap, target.span);
    return { target, added: { col: side === "left" ? target.col - span : target.col + target.span, span, row: target.row } };
  }
  if (target.span < 2) return null;
  const span = Math.floor(target.span / 2);
  return side === "left"
    ? { target: { ...target, col: target.col + span, span: target.span - span }, added: { ...target, span } }
    : { target: { ...target, span: target.span - span }, added: { ...target, col: target.col + target.span - span, span } };
}
export function validBlockTarget(doc: Node, source: BlockRange, target: BlockTarget): boolean {
  if (doc.nodeAt(source.from) !== source.node || source.to !== source.from + source.node.nodeSize) return false;
  if (target.kind === "between") {
    if (target.pos < 0 || target.pos > doc.content.size || target.pos > source.from && target.pos < source.to) return false;
    const $pos = doc.resolve(target.pos);
    return ($pos.parent.type.name === "doc" || source.node.type.name !== "board" && $pos.parent.type.name === "boardCell") && $pos.textOffset === 0;
  }
  if (source.node.type.name === "board") return false;
  if (target.kind === "edge") {
    const block = blockAt(doc, target.block);
    return !!block && block.from === target.block && block.container === -1 && block.node.type.name !== "board" && block.from !== source.from;
  }
  if (target.kind === "cellEdge") {
    const board = cellBoard(doc, target.cell);
    if (!board) return false;
    const cells: CellLayout[] = []; let index = -1; const pos = doc.resolve(target.cell).before();
    board.forEach((cell, offset, i) => { cells.push(cell.attrs as CellLayout); if (pos + 1 + offset === target.cell) index = i; });
    return !!adjacentCellLayout(cells, index, target.side);
  }
  const board = doc.nodeAt(target.board);
  if (board?.type.name !== "board" || board.childCount >= MAX_BOARD_CELLS || !validCell(target.layout)) return false;
  let free = true;
  board.forEach((cell) => { if (!target.insertRow && cell.attrs.row === target.layout.row && cell.attrs.col < target.layout.col + target.layout.span && target.layout.col < cell.attrs.col + cell.attrs.span) free = false; });
  return free;
}

interface Item { node: Node; pos: number; cells?: Cell[] }
interface Cell extends CellLayout { node: Node; pos: number; blocks: Item[] }
function items(parent: Node, start: number): Item[] {
  const result: Item[] = [];
  parent.forEach((node, offset) => {
    const pos = start + offset;
    const item: Item = { node, pos };
    if (node.type.name === "board") {
      item.cells = [];
      node.forEach((cell, cellOffset) => item.cells!.push({ ...cell.attrs as CellLayout, node: cell, pos: pos + 1 + cellOffset, blocks: items(cell, pos + 2 + cellOffset) }));
    }
    result.push(item);
  });
  return result;
}
export function moveBlockDocument(doc: Node, source: BlockRange, target: BlockTarget): { doc: Node; pos: number } | null {
  if (!validBlockTarget(doc, source, target)) return null;
  if (target.kind === "between" && (target.pos === source.from || target.pos === source.to)) return null;
  const top = items(doc, 0);
  const allCells = top.flatMap((item) => item.cells ?? []);
  const sourceBlocks = source.container === -1 ? top : allCells.find((cell) => cell.pos === source.container)!.blocks;
  const sourceIndex = sourceBlocks.findIndex((item) => item.pos === source.from);
  if (sourceIndex < 0) return null;
  const moved = sourceBlocks[sourceIndex];
  if (target.kind === "between") {
    const $pos = doc.resolve(target.pos);
    const dest = $pos.depth ? allCells.find((cell) => cell.pos === $pos.before())!.blocks : top;
    const index = $pos.index();
    sourceBlocks.splice(sourceIndex, 1);
    dest.splice(index - (dest === sourceBlocks && sourceIndex < index ? 1 : 0), 0, moved);
  } else if (target.kind === "edge") {
    const anchor = top.find((item) => item.pos === target.block)!;
    sourceBlocks.splice(sourceIndex, 1);
    const schema = doc.type.schema;
    const pair = target.side === "left" ? [moved, anchor] : [anchor, moved];
    top.splice(top.indexOf(anchor), 1, { pos: -2, node: schema.nodes.board.create(), cells: pair.map((item, i) => ({
      col: i * 6 + 1, span: 6, row: 1, pos: -2, node: schema.nodes.boardCell.create(), blocks: [item],
    })) });
  } else {
    const board = target.kind === "grid" ? top.find((item) => item.pos === target.board)! : top.find((item) => item.cells?.some((cell) => cell.pos === target.cell))!;
    const cells = board.cells!;
    let layout: CellLayout;
    if (target.kind === "cellEdge") {
      const index = cells.findIndex((cell) => cell.pos === target.cell);
      const next = adjacentCellLayout(cells, index, target.side)!;
      Object.assign(cells[index], next.target); layout = next.added;
    } else {
      layout = target.layout;
      if (target.insertRow) cells.forEach((cell) => { if (cell.row >= layout.row) cell.row++; });
    }
    sourceBlocks.splice(sourceIndex, 1);
    cells.push({ ...layout, pos: -2, node: doc.type.schema.nodes.boardCell.create(), blocks: [moved] });
    board.cells = resolveLayout(cells, cells.length - 1);
  }
  let movedPos = -1, position = 0;
  const nodes: Node[] = [];
  for (const item of top) {
    let node = item.node;
    if (item.cells) {
      const cells = resolveLayout(item.cells.filter((cell) => cell.blocks.length), -1);
      if (!cells.length) continue;
      let cellPos = position + 1;
      const children = cells.map((cell) => {
        let blockPos = cellPos + 1;
        const blocks = cell.blocks.map((block) => { if (block === moved) movedPos = blockPos; blockPos += block.node.nodeSize; return block.node; });
        const child = cell.node.type.create({ col: cell.col, span: cell.span, row: cell.row }, blocks);
        cellPos += child.nodeSize; return child;
      });
      node = node.type.create(node.attrs, children, node.marks);
    }
    if (item === moved) movedPos = position;
    nodes.push(node); position += node.nodeSize;
  }
  // Son pano/widget paragrafı aynı transaction'a dahil; appendTransaction gerektirmez.
  if (!nodes.length || nodes[nodes.length - 1].type.name === "board" || widgetBlocks.has(nodes[nodes.length - 1].type.name)) nodes.push(doc.type.schema.nodes.paragraph.create());
  const next = doc.copy(Fragment.from(nodes));
  if (next.eq(doc) || movedPos < 0) return null;
  next.check();
  return { doc: next, pos: movedPos };
}
export function selectBlock(tr: Transaction, pos: number) {
  const node = tr.doc.nodeAt(pos)!;
  tr.setSelection(node.isAtom || !node.isTextblock ? NodeSelection.create(tr.doc, pos)
    : TextSelection.create(tr.doc, pos + 1, pos + node.nodeSize - 1));
  return tr;
}
export function blockMoveTransaction(state: EditorState, source: BlockRange, target: BlockTarget) {
  const result = moveBlockDocument(state.doc, source, target);
  if (!result) return null;
  // Kapsayıcı sınırlarında değiştir; kısmen açık dilim hücre/listenin yapısını bozmaz.
  let first = 0, start = 0;
  while (first < state.doc.childCount && first < result.doc.childCount && state.doc.child(first).eq(result.doc.child(first))) { start += state.doc.child(first).nodeSize; first++; }
  let oldLast = state.doc.childCount - 1, newLast = result.doc.childCount - 1;
  let oldEnd = state.doc.content.size, newEnd = result.doc.content.size;
  while (oldLast >= first && newLast >= first && state.doc.child(oldLast).eq(result.doc.child(newLast))) { oldEnd -= state.doc.child(oldLast--).nodeSize; newEnd -= result.doc.child(newLast--).nodeSize; }
  const tr = closeHistory(state.tr).replaceWith(start, oldEnd, result.doc.content.cut(start, newEnd));
  return selectBlock(tr, result.pos).scrollIntoView();
}
export function keyboardBlockTarget(doc: Node, source: BlockRange, direction: -1 | 1): BlockTarget | null {
  const $pos = doc.resolve(source.from), parent = $pos.parent, index = $pos.index();
  if (direction < 0 && index > 0) return { kind: "between", pos: source.from - parent.child(index - 1).nodeSize };
  if (direction > 0 && index < parent.childCount - 1) return { kind: "between", pos: source.to + parent.child(index + 1).nodeSize };
  if (source.board !== null) return { kind: "between", pos: source.board + (direction > 0 ? doc.nodeAt(source.board)!.nodeSize : 0) };
  return null;
}
