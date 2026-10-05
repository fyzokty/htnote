import { describe, expect, it } from "vitest";
import { addedCellLayout, BOARD_STYLE, cellStyle, parseCell, readBoard, removedCellLayout, resolveLayout, serializeBoard, validCell, validLayout } from "./board";
import { classifyTopLevel } from "./blockClassifier";
import { wrapRawBlocks, serializeVisualHtml } from "./visualPipeline";
import { Editor } from "@tiptap/core";
import { createVisualExtensions } from "./extensions";
import { serializeChecklist } from "./checklist";
import { serializeTextBox } from "./textBox";
import { serializeCopyFields } from "./copyFields";
import { serializeTemplate } from "./template";
import { serializeCalc } from "./calc";

const defaults = [{ col: 1, span: 7, row: 1, html: "<p>Left</p>" }, { col: 8, span: 5, row: 1, html: "<p>Right</p>" }];
const source = serializeBoard(defaults);
describe("board format and layout", () => {
  it("validates integer cells and produces portable canonical CSS", () => {
    expect(BOARD_STYLE).toBe("display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; align-items: start;");
    expect(cellStyle(defaults[0])).toBe("grid-column: 1 / span 7; grid-row: 1;");
    expect(parseCell("12 1 100")).toEqual({ col: 12, span: 1, row: 100 });
    for (const value of ["0 1 1", "1 13 1", "12 2 1", "1 1 101", "1.5 1 1", "01 1 1", "1  1 1", "1 1 1 ", "NaN 1 1"]) expect(parseCell(value)).toBeNull();
    expect(validCell({ col: 1, span: 1.5, row: 1 })).toBe(false);
    expect(validLayout([{ col: 1, span: 1, row: 2 }])).toBe(false);
  });
  it("keeps the moved cell, pushes collisions in a chain and compacts empty rows", () => {
    const cells = [
      { col: 1, span: 7, row: 1, id: "left" }, { col: 7, span: 6, row: 1, id: "moved" },
      { col: 1, span: 12, row: 2, id: "below" }, { col: 2, span: 2, row: 8, id: "last" },
    ];
    expect(resolveLayout(cells, 1)).toEqual([
      { col: 7, span: 6, row: 1, id: "moved" }, { col: 1, span: 7, row: 2, id: "left" },
      { col: 1, span: 12, row: 3, id: "below" }, { col: 2, span: 2, row: 4, id: "last" },
    ]);
    expect(cells[2].row).toBe(2);
  });
  it("sorts DOM order, handles upward movement, and clips bounds", () => {
    expect(resolveLayout([{ col: 99, span: 99, row: 900 }, { col: -1, span: 0, row: -2 }], 0)).toEqual([
      { col: 1, span: 1, row: 1 }, { col: 12, span: 1, row: 2 },
    ]);
    expect(resolveLayout([{ col: 1, span: 12, row: 1, id: "old" }, { col: 1, span: 12, row: 1, id: "up" }], 1).map(({ id, row }) => [id, row])).toEqual([["up", 1], ["old", 2]]);
    expect(resolveLayout([{ col: 8, span: 5, row: 4 }, { col: 1, span: 7, row: 4 }], -1).map((cell) => [cell.row, cell.col])).toEqual([[1, 1], [1, 8]]);
  });
  it("adds in the right gap or in a new full row, removes and enforces 48", () => {
    expect(addedCellLayout([{ col: 1, span: 3, row: 1 }, { col: 8, span: 5, row: 1 }], 0)).toEqual({ col: 4, span: 4, row: 1 });
    expect(addedCellLayout([{ col: 1, span: 3, row: 1 }, { col: 4, span: 3, row: 1 }, { col: 10, span: 3, row: 1 }], 0)).toEqual({ col: 7, span: 3, row: 1 });
    expect(addedCellLayout(defaults, 1)).toEqual({ col: 1, span: 12, row: 2 });
    expect(removedCellLayout([{ col: 1, span: 12, row: 1 }, { col: 1, span: 12, row: 2 }], 0)).toEqual([{ col: 1, span: 12, row: 1 }]);
    const limit = Array.from({ length: 48 }, (_, index) => ({ col: 1, span: 12, row: index + 1 }));
    expect(validLayout(limit)).toBe(true);
    expect(addedCellLayout(limit, 0)).toBeNull();
    expect(() => resolveLayout([...limit, limit[0]], 0)).toThrow(RangeError);
  });
  it("recognizes the exact format and preserves every invalid deviation as raw", () => {
    expect(readBoard(source)).toEqual(defaults);
    expect(classifyTopLevel(source)[0].kind).toBe("board");
    const invalid = [
      source.replace('data-htnote-layout="board"', 'data-htnote-layout="board" id="extra"'),
      source.replace('class="htnote-board"', 'class="htnote-board extra"'),
      source.replace('gap: 16px;', 'gap:16px;'),
      source.replace('data-htnote-cell="1 7 1"', 'data-htnote-cell="1 7 1" title="extra"'),
      source.replace('class="htnote-board-cell"', 'class="wrong"'),
      source.replace('grid-row: 1;', 'grid-row:1;'),
      source.replace('data-htnote-cell="1 7 1"', 'data-htnote-cell="0 7 1"'),
      source.replace('data-htnote-cell="1 7 1"', 'data-htnote-cell="1 7 1" data-htnote-cell="1 7 1"'),
      serializeBoard([{ ...defaults[0], span: 8 }, defaults[1]]),
      serializeBoard([{ ...defaults[0], row: 1 }, { ...defaults[1], row: 3 }]),
      source.replace('<p>Left</p>', source),
      source.replace('<p>Left</p>', ''),
      source.replace('</div><div class="htnote-board-cell"', '</div>oops<div class="htnote-board-cell"'),
      source.replace('</div><div class="htnote-board-cell"', '</div><!--comment--><div class="htnote-board-cell"'),
      source.slice(0, -6),
      source.replace('</p></div>', '</p>'),
      serializeBoard(Array.from({ length: 49 }, (_, index) => ({ col: 1, span: 12, row: index + 1, html: '<p></p>' }))),
    ];
    // Sıralamayı bozan HTML, üreticinin sıralamasına uğramadan hazırlanır.
    invalid.push(source.replace(/(<div class="htnote-board-cell"[^]*?<\/div>)(<div class="htnote-board-cell"[^]*?<\/div>)/, '$2$1'));
    for (const html of invalid) {
      expect(readBoard(html), html).toBeNull();
      expect(classifyTopLevel(html)).toEqual([{ kind: "raw", html }]);
      expect(serializeVisualHtml(wrapRawBlocks(html))).toBe(html);
    }
  });
  it("preserves all nested widget sources and raw HTML and has an idempotent visual round trip", () => {
    const widgets = [
      serializeChecklist({ title: 'List', items: [{ text: 'Item', checked: false }], background: '', html: null }),
      serializeTextBox({ title: 'Box', content: 'Text', background: '', html: null }),
      serializeCopyFields({ title: 'Fields', fields: [{ label: 'Key', value: 'Value' }], background: '', html: null }),
      serializeTemplate({ title: 'Template', content: '{{Name}}', background: '', html: null }),
      serializeCalc({ title: 'Calc', content: '1+2', background: '', html: null }),
    ].map((html) => html.replace(/class=/g, 'class ='));
    const html = serializeBoard([{ ...defaults[0], html: widgets.join('') }, { ...defaults[1], html: '<img src="./assets/photo.png" width="50%"><canvas data-x="yes"></canvas><script>alert(1)</script>' }]);
    const editor = new Editor({ extensions: createVisualExtensions(''), content: wrapRawBlocks(html) });
    const saved = serializeVisualHtml(editor.getHTML());
    for (const widget of widgets) expect(saved).toContain(widget);
    expect(saved).toContain('<canvas data-x="yes"></canvas>');
    expect(saved).toContain('<script>alert(1)</script>');
    expect(saved).toContain('width="50%"');
    expect(editor.state.doc.firstChild?.firstChild?.lastChild?.type.name).toBe('paragraph');
    editor.commands.setContent(wrapRawBlocks(saved));
    expect(serializeVisualHtml(editor.getHTML())).toBe(saved);
    editor.destroy();
  });
});
