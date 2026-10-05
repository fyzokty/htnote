import { exactWidgetElement, readWidgetRoot, widgetChildren, type WidgetElement } from "./widgets/widgetFormat";

export interface CellLayout { col: number; span: number; row: number }
export interface BoardCellHtml extends CellLayout { html: string }
export const MAX_BOARD_CELLS = 48;
export const BOARD_STYLE = "display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; align-items: start;";
export const cellStyle = ({ col, span, row }: CellLayout) => `grid-column: ${col} / span ${span}; grid-row: ${row};`;
export const cellValue = ({ col, span, row }: CellLayout) => `${col} ${span} ${row}`;
export function validCell({ col, span, row }: CellLayout): boolean {
  return [col, span, row].every(Number.isInteger) && col >= 1 && span >= 1 && col + span <= 13 && row >= 1 && row <= 100;
}
export function parseCell(value: string): CellLayout | null {
  if (!/^[1-9]\d* [1-9]\d* [1-9]\d*$/.test(value)) return null;
  const [col, span, row] = value.split(" ").map(Number);
  const cell = { col, span, row };
  return validCell(cell) ? cell : null;
}
export const compareCells = (a: CellLayout, b: CellLayout) => a.row - b.row || a.col - b.col;
const mask = ({ col, span }: CellLayout) => ((1 << span) - 1) << (col - 1);

export function validLayout(cells: CellLayout[]): boolean {
  if (!cells.length || cells.length > MAX_BOARD_CELLS) return false;
  let row = 1, occupied = 0;
  return cells.every((cell, index) => {
    if (!validCell(cell) || !index && cell.row !== 1 || index && compareCells(cells[index - 1], cell) >= 0 || cell.row > row + 1) return false;
    if (cell.row !== row) { if (cell.row !== row + 1) return false; row = cell.row; occupied = 0; }
    const bits = mask(cell);
    if (occupied & bits) return false;
    occupied |= bits;
    return true;
  });
}

// On iki sütun bit maskesidir; satır araması 100 + 48 ile sınırlıdır.
// Öncelikli hücre sabit kalır; diğerleri kaynak sırasıyla aşağı itilir.
export function resolveLayout<T extends CellLayout>(cells: readonly T[], movedIndex: number): T[] {
  if (cells.length > MAX_BOARD_CELLS) throw new RangeError("board cell limit");
  const normalized = cells.map((cell, index) => {
    const col = Math.max(1, Math.min(12, Math.trunc(cell.col) || 1));
    return { cell: { ...cell, col, span: Math.max(1, Math.min(13 - col, Math.trunc(cell.span) || 1)),
      row: Math.max(1, Math.min(100, Math.trunc(cell.row) || 1)) }, index };
  });
  normalized.sort((a, b) => (a.index === movedIndex ? -1 : b.index === movedIndex ? 1 : compareCells(a.cell, b.cell) || a.index - b.index));
  const rows = new Map<number, number>();
  for (const { cell } of normalized) {
    const bits = mask(cell);
    while ((rows.get(cell.row) ?? 0) & bits) cell.row++;
    rows.set(cell.row, (rows.get(cell.row) ?? 0) | bits);
  }
  const compact = new Map([...rows.keys()].sort((a, b) => a - b).map((row, index) => [row, index + 1]));
  return normalized.map(({ cell }) => ({ ...cell, row: compact.get(cell.row)! })).sort(compareCells);
}

export function addedCellLayout(cells: readonly CellLayout[], index: number): CellLayout | null {
  if (cells.length >= MAX_BOARD_CELLS || !cells[index]) return null;
  const active = cells[index];
  let col = active.col + active.span;
  for (const cell of cells) {
    if (cell.row !== active.row || cell.col < col) continue;
    if (cell.col > col) return { col, span: cell.col - col, row: active.row };
    col = cell.col + cell.span;
  }
  return col < 13 ? { col, span: 13 - col, row: active.row }
    : { col: 1, span: 12, row: Math.max(...cells.map((cell) => cell.row)) + 1 };
}
export function removedCellLayout<T extends CellLayout>(cells: readonly T[], index: number): T[] {
  return resolveLayout(cells.filter((_, i) => i !== index), -1);
}

export interface BoardGrid {
  // Sütun başlangıçları ve en sağ kenar; gap ayrıca saklanır.
  edges: number[];
  gap: number;
  rows: { row: number; top: number; bottom: number }[];
}
export interface BoardTarget extends CellLayout { insertRow: boolean }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function boardPointerTarget(x: number, y: number, cell: CellLayout, grid: BoardGrid): BoardTarget {
  let col = 1;
  for (let i = 0; i < 12; i++) if (x >= grid.edges[i]) col = i + 1;
  col = clamp(col, 1, 13 - cell.span);
  for (let i = 0; i < grid.rows.length - 1; i++) {
    const next = grid.rows[i + 1];
    const boundary = (grid.rows[i].bottom + next.top) / 2;
    if (Math.abs(y - boundary) <= 8) return { col, span: cell.span, row: next.row, insertRow: true };
  }
  const last = grid.rows[grid.rows.length - 1];
  if (y > last.bottom) return { col, span: cell.span, row: last.row + 1, insertRow: true };
  const row = grid.rows.find((bounds) => y <= bounds.bottom)?.row ?? last.row;
  return { col, span: cell.span, row, insertRow: false };
}
export function boardResizeTarget(x: number, edge: "left" | "right", cell: CellLayout, grid: BoardGrid): BoardTarget {
  // Sağ kenar gap'in önüne, sol kenar gap'in sonuna yapışır.
  const boundaries = grid.edges.map((value, index) => edge === "right" && index > 0 && index < 12 ? value - grid.gap : value);
  const nearest = boundaries.reduce((best, value, index) => Math.abs(value - x) < Math.abs(boundaries[best] - x) ? index : best, 0) + 1;
  const end = cell.col + cell.span;
  const col = edge === "left" ? clamp(nearest, 1, end - 1) : cell.col;
  const span = edge === "left" ? end - col : clamp(nearest, col + 1, 13) - col;
  return { col, span, row: cell.row, insertRow: false };
}
export function boardTargetLayout<T extends CellLayout>(cells: readonly T[], index: number, target: BoardTarget): T[] {
  return resolveLayout(cells.map((cell, i) => i === index ? { ...cell, col: target.col, span: target.span, row: target.row }
    : { ...cell, row: cell.row + (target.insertRow && cell.row >= target.row ? 1 : 0) }), index);
}

export function readBoard(html: string): BoardCellHtml[] | null {
  const root = readWidgetRoot(html);
  if (!root || !exactWidgetElement(root, "div", { class: "htnote-board", "data-htnote-layout": "board", style: BOARD_STYLE })) return null;
  const children = widgetChildren(root);
  const cells: BoardCellHtml[] = [];
  for (const node of children) {
    if (!("tagName" in node)) return null;
    const layout = parseCell(node.attrs.find((attr) => attr.name === "data-htnote-cell")?.value ?? "");
    if (!layout || !exactWidgetElement(node, "div", { class: "htnote-board-cell", "data-htnote-cell": cellValue(layout), style: cellStyle(layout) })) return null;
    const location = node.sourceCodeLocation!;
    const inner = html.slice(location.startTag!.endOffset, location.endTag!.startOffset);
    if (!inner.trim()) return null;
    function nested(child: WidgetElement): boolean {
      return child.attrs.some((attr) => attr.name === "class" && attr.value.split(/\s+/).includes("htnote-board")) ||
        child.childNodes.some((descendant) => "tagName" in descendant && nested(descendant));
    }
    if (node.childNodes.some((child) => "tagName" in child && nested(child))) return null;
    cells.push({ ...layout, html: inner });
  }
  return validLayout(cells) ? cells : null;
}
export function serializeBoard(cells: readonly BoardCellHtml[]): string {
  return `<div class="htnote-board" data-htnote-layout="board" style="${BOARD_STYLE}">${[...cells].sort(compareCells).map((cell) =>
    `<div class="htnote-board-cell" data-htnote-cell="${cellValue(cell)}" style="${cellStyle(cell)}">${cell.html || "<p></p>"}</div>`).join("")}</div>`;
}
