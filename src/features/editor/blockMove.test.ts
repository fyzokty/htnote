import { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";
import { createVisualExtensions } from "./extensions";
import { blockAt, blockMoveTransaction, moveBlockDocument, keyboardBlockTarget, validBlockTarget, type BlockTarget } from "./blockMove";
import { serializeBoard, validLayout } from "./board";
import { wrapRawBlocks } from "./visualPipeline";

let editor: Editor;
afterEach(() => editor?.destroy());
const p = (text: string) => `<p>${text}</p>`;
const board = (texts = ["L", "R"]) => serializeBoard(texts.map((text, i) => ({ col: i * 6 + 1, span: 6, row: 1, html: p(text) })));
function setup(html: string) { editor = new Editor({ extensions: createVisualExtensions(""), content: wrapRawBlocks(html) }); }
function pos(text: string) { let found = -1; editor.state.doc.descendants((node, at) => { if (node.isTextblock && node.textContent === text) found = at; }); return found; }
function move(text: string, target: BlockTarget) { const tr = blockMoveTransaction(editor.state, blockAt(editor.state.doc, pos(text))!, target); if (tr) editor.view.dispatch(tr); return tr; }
function check() { editor.state.doc.check(); editor.state.doc.descendants((node) => { if (node.type.name === "board") { const cells: { col: number; span: number; row: number }[] = []; node.forEach((cell) => cells.push(cell.attrs as typeof cells[number])); expect(validLayout(cells)).toBe(true); } }); }

describe("block document moves", () => {
  it("moves between doc blocks and into a cell, selecting the complete text", () => {
    setup(p("A") + p("B") + board());
    move("B", { kind: "between", pos: 0 });
    expect(editor.state.doc.firstChild?.textContent).toBe("B");
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.to - editor.state.selection.from).toBe(1);
    move("B", { kind: "between", pos: pos("L") });
    expect(editor.state.doc.child(1).firstChild?.textContent).toBe("BL"); check();
  });
  it.each(["left", "right"] as const)("creates a board at the target with the moved block on the %s", (side) => {
    setup(p("A") + p("B") + p("Tail"));
    move("B", { kind: "edge", block: pos("A"), side });
    const result = editor.state.doc.firstChild!;
    expect(result.type.name).toBe("board");
    expect(result.child(0).attrs).toMatchObject({ col: 1, span: 6, row: 1 });
    expect(result.child(1).attrs).toMatchObject({ col: 7, span: 6, row: 1 });
    expect(result.child(side === "left" ? 0 : 1).textContent).toBe("B"); check();
  });
  it("splits a cell beside its block", () => {
    setup(board() + p("A"));
    move("A", { kind: "cellEdge", cell: 1, side: "right" });
    const result = editor.state.doc.firstChild!;
    expect(result.childCount).toBe(3);
    expect(result.child(0).attrs).toMatchObject({ col: 1, span: 3, row: 1 });
    expect(result.child(1).attrs).toMatchObject({ col: 4, span: 3, row: 1 });
    expect(result.child(1).textContent).toBe("A"); check();
  });
  it.each(["left", "right"] as const)("uses a free interval on the %s without shrinking the cell", (side) => {
    setup(serializeBoard([{ col: 5, span: 4, row: 1, html: p("L") }]) + p("A"));
    move("A", { kind: "cellEdge", cell: 1, side });
    const result = editor.state.doc.firstChild!, added = result.child(side === "left" ? 0 : 1);
    expect(added.attrs).toMatchObject({ col: side === "left" ? 1 : 9, span: 4, row: 1 });
    expect(result.child(side === "left" ? 1 : 0).attrs.span).toBe(4); check();
  });
  it("adds a block to an empty grid interval and inserts rows", () => {
    setup(serializeBoard([{ col: 1, span: 4, row: 1, html: p("L") }]) + p("A") + p("B"));
    move("A", { kind: "grid", board: 0, layout: { col: 5, span: 6, row: 1 }, insertRow: false });
    expect(editor.state.doc.firstChild?.child(1).textContent).toBe("A");
    move("B", { kind: "grid", board: 0, layout: { col: 1, span: 6, row: 1 }, insertRow: true });
    expect(editor.state.doc.firstChild?.firstChild?.textContent).toBe("B");
    expect(editor.state.doc.firstChild?.child(1).attrs.row).toBe(2); check();
  });
  it("removes empty source cells, compacts rows and removes the final empty board", () => {
    setup(serializeBoard([{ col: 1, span: 6, row: 1, html: p("L") }, { col: 1, span: 6, row: 2, html: p("R") }]) + p("Tail"));
    move("L", { kind: "between", pos: editor.state.doc.firstChild!.nodeSize });
    expect(editor.state.doc.firstChild?.childCount).toBe(1);
    expect(editor.state.doc.firstChild?.firstChild?.attrs.row).toBe(1);
    move("R", { kind: "between", pos: editor.state.doc.firstChild!.nodeSize });
    expect(editor.state.doc.child(0).type.name).toBe("paragraph");
    expect(editor.state.doc.textContent).toBe("RLTail"); check();
  });
  it("keeps a cell that still contains one block and supports another board as destination", () => {
    setup(serializeBoard([{ col: 1, span: 12, row: 1, html: p("L") + p("Keep") }]) + board(["Dest"]));
    move("L", { kind: "between", pos: pos("Dest") });
    expect(editor.state.doc.child(0).firstChild?.childCount).toBe(1);
    expect(editor.state.doc.child(0).textContent).toBe("Keep");
    expect(editor.state.doc.child(1).textContent).toBe("LDest"); check();
  });
  it("rejects nested boards, self drops, full boards and occupied grid targets", () => {
    setup(board() + p("A"));
    const source = blockAt(editor.state.doc, 0)!;
    expect(validBlockTarget(editor.state.doc, source, { kind: "between", pos: pos("L") })).toBe(false);
    expect(validBlockTarget(editor.state.doc, source, { kind: "edge", block: pos("A"), side: "left" })).toBe(false);
    expect(move("A", { kind: "edge", block: pos("A"), side: "left" })).toBeNull();
    expect(move("A", { kind: "grid", board: 0, layout: { col: 1, span: 6, row: 1 }, insertRow: false })).toBeNull();
    editor.destroy(); setup(serializeBoard(Array.from({ length: 48 }, (_, i) => ({ col: 1, span: 12, row: i + 1, html: p(`C${i}`) }))) + p("A"));
    expect(move("A", { kind: "cellEdge", cell: 1, side: "right" })).toBeNull();
    expect(move("A", { kind: "grid", board: 0, layout: { col: 1, span: 6, row: 49 }, insertRow: false })).toBeNull();
  });
  it("does not change the document when dropped at either current boundary", () => {
    setup(p("A") + p("B")); const source = blockAt(editor.state.doc, 0)!;
    for (const at of [source.from, source.to]) expect(moveBlockDocument(editor.state.doc, source, { kind: "between", pos: at })).toBeNull();
  });
  it("does not repair a loaded board-end document as a side effect of an unchanged drop", () => {
    setup(board()); const before = editor.schema.nodes.doc.create(null, editor.state.doc.firstChild!), source = blockAt(before, 0)!;
    expect(before.lastChild?.type.name).toBe("board");
    for (const at of [source.from, source.to]) expect(moveBlockDocument(before, source, { kind: "between", pos: at })).toBeNull();
    expect(before.lastChild?.type.name).toBe("board");
  });
  it("treats an inner list item and table cell as part of their enclosing block", () => {
    setup('<ul><li><p>A</p></li><li><p>B</p></li></ul><table><tbody><tr><td><p>C</p></td></tr></tbody></table>');
    expect(blockAt(editor.state.doc, pos("B") + 1)?.node.type.name).toBe("bulletList");
    expect(blockAt(editor.state.doc, pos("C") + 1)?.node.type.name).toBe("table");
  });
  it("commits once and undoes with one step including trailing paragraphs", () => {
    setup(p("A") + p("B")); const before = editor.getJSON(); let count = 0;
    editor.on("transaction", () => count++);
    move("B", { kind: "edge", block: 0, side: "right" });
    expect(count).toBe(1); expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
    editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
    editor.commands.redo(); check();
  });
  it("moves the board itself at doc level", () => {
    setup(board() + p("Tail"));
    const source = blockAt(editor.state.doc, 0)!;
    editor.view.dispatch(blockMoveTransaction(editor.state, source, { kind: "between", pos: editor.state.doc.content.size })!);
    expect(editor.state.doc.child(1).type.name).toBe("board");
    expect(editor.state.selection).toBeInstanceOf(NodeSelection); check();
  });
  it.each(["image", "audio", "video", "htmlBlock", "checklist", "textBox", "copyfields", "template", "calc"])("preserves every attribute of %s when moving into and out of a cell", (type) => {
    setup(board() + p("Tail"));
    const node = editor.schema.nodes[type].create(type === "htmlBlock" ? { html: '<aside data-custom="yes">Raw &amp; intact</aside>' }
      : ["image", "audio", "video"].includes(type) ? { src: "assets/fixture.bin", width: "50%", align: "right" } : { title: "Keep", html: "Original source", content: "Value" });
    const start = editor.state.doc.content.size;
    editor.view.dispatch(editor.state.tr.insert(start, node));
    const before = editor.state.doc.nodeAt(start)!;
    editor.view.dispatch(blockMoveTransaction(editor.state, blockAt(editor.state.doc, start)!, { kind: "between", pos: pos("L") })!);
    expect((editor.state.selection as NodeSelection).node.eq(before)).toBe(true);
    editor.view.dispatch(blockMoveTransaction(editor.state, blockAt(editor.state.doc, editor.state.selection.from)!, { kind: "between", pos: editor.state.doc.firstChild!.nodeSize })!);
    expect((editor.state.selection as NodeSelection).node.eq(before)).toBe(true); check();
  });
});

describe("keyboard and draggable", () => {
  it.each([-1, 1] as const)("moves inside a cell then exits its %s boundary", (direction) => {
    setup(serializeBoard([{ col: 1, span: 12, row: 1, html: p("A") + p("B") }]) + p("Tail"));
    const name = direction < 0 ? "B" : "A";
    editor.commands.setTextSelection(pos(name) + 1);
    const key = () => editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: direction < 0 ? "ArrowUp" : "ArrowDown", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    key(); expect(editor.state.doc.firstChild?.firstChild?.textContent).toBe("BA");
    key(); expect(editor.state.doc.child(direction < 0 ? 0 : 1).textContent).toBe(name); check();
    editor.commands.undo(); expect(editor.state.doc.firstChild?.firstChild?.childCount).toBe(2);
  });
  it("does nothing at doc boundaries and moves neighboring blocks", () => {
    setup(p("A") + p("B")); const source = blockAt(editor.state.doc, 0)!;
    expect(keyboardBlockTarget(editor.state.doc, source, -1)).toBeNull();
    move("A", keyboardBlockTarget(editor.state.doc, source, 1)!);
    expect(editor.state.doc.textContent).toBe("BA");
  });
  it("moves a widget from its input even when the ProseMirror cursor belongs to another block", () => {
    setup(p("A") + p("B")); editor.commands.insertContentAt(3, { type: "checklist" });
    const input = document.createElement("input"); (editor.view.nodeDOM(3) as HTMLElement).append(input);
    editor.commands.setTextSelection(1);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    expect(editor.state.doc.firstChild?.type.name).toBe("checklist");
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  });
  it.each(["image", "audio", "video", "textBox", "checklist", "copyfields", "template", "calc", "htmlBlock"])("disables native drag for %s while retaining selection/delete", (type) => {
    setup(p("Tail")); expect(editor.schema.nodes[type].spec.draggable).toBe(false);
    editor.commands.insertContentAt(0, { type }); editor.commands.setNodeSelection(0);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    editor.commands.deleteSelection(); expect(editor.state.doc.textContent).toBe("Tail");
  });
});
