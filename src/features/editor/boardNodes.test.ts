import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { afterEach, describe, expect, it } from "vitest";
import { createVisualExtensions } from "./extensions";
import { activeBoard, boardLayoutKey } from "./boardNodes";
import { serializeBoard, validLayout } from "./board";
import { wrapRawBlocks } from "./visualPipeline";

let editor: Editor;
afterEach(() => editor?.destroy());
function setup(content = "<p></p>") { editor = new Editor({ extensions: createVisualExtensions(""), content }); return editor; }
function cells() {
  const active = activeBoard(editor.state);
  const values: { col: number; span: number; row: number; text: string }[] = [];
  active?.board.forEach((cell) => values.push({ col: cell.attrs.col, span: cell.attrs.span, row: cell.attrs.row, text: cell.textContent }));
  return values;
}
function focusCell(index: number, end = false) {
  let boardPos = 0;
  editor.state.doc.forEach((node, pos) => { if (node.type.name === "board") boardPos = pos; });
  const board = editor.state.doc.nodeAt(boardPos)!;
  let pos = boardPos + 1;
  for (let i = 0; i < index; i++) pos += board.child(i).nodeSize;
  editor.commands.setTextSelection(end ? pos + board.child(index).nodeSize - 2 : pos + 2);
}
function key(key: string, shiftKey = false, ctrlKey = false, altKey = false) {
  const event = new KeyboardEvent("keydown", { key, shiftKey, ctrlKey, altKey, bubbles: true, cancelable: true });
  editor.view.dom.dispatchEvent(event);
  return event;
}
function separate() { editor.view.dispatch(closeHistory(editor.state.tr)); }

describe("board editor commands", () => {
  it.each(["direct", "blockquote", "list", "table"])("rejects a nested board pasted through %s without changing the document", (container) => {
    setup(); editor.commands.insertBoard();
    const { board, boardCell, paragraph, blockquote, bulletList, listItem, table, tableRow, tableCell } = editor.schema.nodes;
    const nested = board.create(null, boardCell.create({ col: 1, span: 12, row: 1 }, paragraph.create()));
    const pasted = container === "blockquote" ? blockquote.create(null, nested)
      : container === "list" ? bulletList.create(null, listItem.create(null, [paragraph.create(), nested]))
      : container === "table" ? table.create(null, tableRow.create(null, tableCell.create(null, nested))) : nested;
    const before = editor.state.doc;
    // Yapıştırmanın oluşturduğu transaction'ı doğrudan gönder; komut/HTML normalizasyonu filtreyi gizlemesin.
    const active = activeBoard(editor.state)!;
    const cell = boardCell.create(active.cell.attrs, [pasted, paragraph.create()]);
    const outer = board.create(null, [cell, active.board.child(1)]);
    editor.view.dispatch(editor.state.tr.replaceWith(0, active.board.nodeSize, outer));
    expect(editor.state.doc).toBe(before);
  });
  it.each([
    { col: 0, span: 7, row: 1 },
    { col: 1, span: 13, row: 1 },
    { col: 1, span: 7, row: 3 },
    { col: 8, span: 5, row: 1 },
  ])("rejects invalid cell layout %j", (attrs) => {
    setup(); editor.commands.insertBoard();
    const before = editor.state.doc;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(activeBoard(editor.state)!.cellPos, undefined, attrs));
    expect(editor.state.doc).toBe(before);
  });
  it.each(["blockquote", "list", "table"])("validates boards in %s and appends a paragraph after their last widget", (container) => {
    setup();
    const { board, boardCell, paragraph, blockquote, bulletList, listItem, table, tableRow, tableCell, checklist } = editor.schema.nodes;
    const nested = board.create(null, boardCell.create({ col: 1, span: 12, row: 1 }, paragraph.create()));
    const wrapped = container === "blockquote" ? blockquote.create(null, nested)
      : container === "list" ? bulletList.create(null, listItem.create(null, [paragraph.create(), nested]))
      : table.create(null, tableRow.create(null, tableCell.create(null, nested)));
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, wrapped));
    let cellPos = -1;
    editor.state.doc.descendants((node, pos) => { if (node.type.name === "boardCell") cellPos = pos; });
    expect(cellPos).toBeGreaterThan(0);
    editor.view.dispatch(editor.state.tr.replaceWith(cellPos + 1, cellPos + 3, checklist.create()));
    expect(editor.state.doc.nodeAt(cellPos)?.lastChild?.type.name).toBe("paragraph");
    const before = editor.state.doc;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(cellPos, undefined, { col: 1, span: 13, row: 1 }));
    expect(editor.state.doc).toBe(before);
  });
  it("replaces an empty paragraph, otherwise inserts after it, focuses first cell and prevents nesting", () => {
    setup();
    expect(editor.commands.insertBoard()).toBe(true);
    expect(editor.state.doc.firstChild?.type.name).toBe("board");
    expect(cells().map(({ col, span, row }) => [col, span, row])).toEqual([[1, 7, 1], [8, 5, 1]]);
    expect(activeBoard(editor.state)?.index).toBe(0);
    expect(editor.can().insertBoard()).toBe(false);
    expect(editor.commands.insertBoard()).toBe(false);
    expect(editor.commands.insertContent({ type: "blockquote", content: [{ type: "board", content: [{ type: "boardCell", content: [{ type: "paragraph" }] }] }] })).toBe(true);
    // İç içe şema yollarından gelen transaction da filtrelenir.
    expect(editor.state.doc.firstChild?.firstChild?.firstChild?.type.name).toBe("paragraph");
    editor.destroy(); setup("<p>Before</p>");
    editor.commands.insertBoard();
    expect(editor.state.doc.child(0).textContent).toBe("Before");
    expect(editor.state.doc.child(1).type.name).toBe("board");
  });
  it.each([0, 1])("removing cell %s merges content without loss and undoes in one step", (index) => {
    setup(wrapRawBlocks(serializeBoard([{ col: 1, span: 7, row: 1, html: "<p>Left</p>" }, { col: 8, span: 5, row: 1, html: "<p>Right</p>" }])));
    focusCell(index);
    const original = editor.getJSON();
    separate(); editor.commands.removeBoardCell();
    expect(cells()).toHaveLength(1);
    expect(cells()[0].text).toBe("LeftRight");
    editor.commands.undo(); expect(editor.getJSON()).toEqual(original);
    focusCell(index); editor.commands.removeBoardCell();
    separate(); editor.commands.removeBoardCell();
    expect(editor.state.doc.child(0).type.name).toBe("paragraph");
    expect(editor.state.doc.textContent).toBe("LeftRight");
    editor.commands.undo(); expect(cells()).toHaveLength(1);
  });
  it("adds cells, dissolves in DOM order, and undoes each action once", () => {
    setup(); editor.commands.insertBoard();
    editor.commands.insertContent("Left"); focusCell(1); editor.commands.insertContent("Right");
    const before = editor.getJSON();
    separate(); editor.commands.addBoardCell();
    expect(cells().map(({ col, span, row }) => [col, span, row])).toEqual([[1, 7, 1], [8, 5, 1], [1, 12, 2]]);
    editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
    focusCell(0); separate(); editor.commands.dissolveBoard();
    expect(editor.state.doc.textContent).toBe("LeftRight");
    expect(editor.state.doc.child(0).type.name).toBe("paragraph");
    editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
  });
  it("uses the right gap, appends a paragraph after a widget and blocks the 49th cell", () => {
    setup(wrapRawBlocks(serializeBoard([{ col: 1, span: 3, row: 1, html: "<p></p>" }, { col: 8, span: 5, row: 1, html: "<p></p>" }])));
    focusCell(0); editor.commands.addBoardCell();
    expect(cells()[1]).toMatchObject({ col: 4, span: 4, row: 1 });
    editor.commands.insertChecklist();
    expect(activeBoard(editor.state)?.cell.lastChild?.type.name).toBe("paragraph");
    expect(activeBoard(editor.state)?.cell.firstChild?.type.name).toBe("checklist");
    editor.destroy(); setup(wrapRawBlocks(serializeBoard(Array.from({ length: 48 }, (_, index) => ({ col: 1, span: 12, row: index + 1, html: "<p></p>" })))));
    focusCell(0); expect(editor.can().addBoardCell()).toBe(false);
  });
  it("handles layout keys, collision chains, DOM reorder, bounds and individual undo", () => {
    setup(); editor.commands.insertBoard();
    editor.commands.insertContent("Left"); focusCell(1); editor.commands.insertContent("Right");
    key("l", false, true, true);
    expect(boardLayoutKey.getState(editor.state)?.pos).toBe(activeBoard(editor.state)?.cellPos);
    const before = editor.getJSON();
    key("ArrowLeft", true); expect(cells()[1].span).toBe(4);
    key("ArrowRight", true); expect(cells()[1].span).toBe(5);
    editor.commands.undo(); expect(cells()[1].span).toBe(4);
    editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
    focusCell(1); if (boardLayoutKey.getState(editor.state)?.pos === null) editor.commands.toggleBoardLayout();
    key("ArrowLeft");
    expect(cells()).toEqual([{ col: 7, span: 5, row: 1, text: "Right" }, { col: 1, span: 7, row: 2, text: "Left" }]);
    expect(activeBoard(editor.state)?.cell.textContent).toBe("Right");
    expect(validLayout(cells())).toBe(true);
    key("ArrowDown"); expect(cells().map(({ row }) => row)).toEqual([1, 2]);
    key("ArrowRight"); key("ArrowDown");
    expect(cells().map(({ text }) => text)).toEqual(["Left", "Right"]);
    key("ArrowUp"); expect(validLayout(cells())).toBe(true);
    key("Escape"); expect(boardLayoutKey.getState(editor.state)?.pos).toBeNull();
    key("l", false, true, true); key("Enter"); expect(boardLayoutKey.getState(editor.state)?.pos).toBeNull();
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
  });
  it("protects Backspace at cell starts and navigates from cell ends to the next cell and beyond board", () => {
    setup(); editor.commands.insertBoard();
    const original = editor.getJSON();
    key("Backspace"); expect(editor.getJSON()).toEqual(original);
    focusCell(1); key("Backspace"); expect(editor.getJSON()).toEqual(original);
    focusCell(0, true); key("ArrowRight"); expect(activeBoard(editor.state)?.index).toBe(1);
    focusCell(1, true); key("ArrowRight"); expect(activeBoard(editor.state)).toBeNull();
    focusCell(0); key("a", false, true); expect(editor.getJSON()).toEqual(original);
  });
  it("keeps the layout cursor inside a media-only cell and preserves its media", () => {
    setup(wrapRawBlocks(serializeBoard([{ col: 1, span: 6, row: 1, html: '<img src="./assets/photo.png" width="50%">' }, { col: 7, span: 6, row: 1, html: "<p>Right</p>" }])));
    editor.commands.setNodeSelection(2);
    editor.commands.toggleBoardLayout();
    expect(activeBoard(editor.state)?.index).toBe(0);
    key("ArrowRight");
    expect(activeBoard(editor.state)?.cell.firstChild?.attrs.src).toBe("./assets/photo.png");
    expect(activeBoard(editor.state)?.cell.firstChild?.attrs.width).toBe("50%");
    expect(cells()).toEqual([{ col: 2, span: 6, row: 1, text: "" }, { col: 7, span: 6, row: 2, text: "Right" }]);
    key("Escape"); expect(activeBoard(editor.state)?.index).toBe(0);
    key("ArrowRight"); expect(activeBoard(editor.state)?.index).toBe(1);
    editor.destroy();
    setup(wrapRawBlocks(serializeBoard([{ col: 1, span: 6, row: 1, html: '<img src="./assets/left.png">' }, { col: 7, span: 6, row: 1, html: '<img src="./assets/right.png">' }])));
    editor.commands.setNodeSelection(2);
    editor.commands.toggleBoardLayout(); key("Escape"); key("ArrowRight");
    expect(activeBoard(editor.state)?.index).toBe(1);
    expect(editor.state.selection.from).toBe(activeBoard(editor.state)!.cellPos + 1);
  });
});
