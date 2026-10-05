import { Node as TiptapNode } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { getPlatform } from "@/lib/platform";
import { addedCellLayout, boardTargetLayout, BOARD_STYLE, cellStyle, cellValue, parseCell, readBoard, resolveLayout, validCell, validLayout, type BoardTarget, type CellLayout } from "./board";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    board: {
      insertBoard: () => ReturnType;
      addBoardCell: () => ReturnType;
      removeBoardCell: () => ReturnType;
      dissolveBoard: () => ReturnType;
      toggleBoardLayout: () => ReturnType;
      moveBoardCell: (key: string, resize?: boolean) => ReturnType;
      setBoardCellLayout: (cellPos: number, target: BoardTarget) => ReturnType;
    };
  }
}
export const boardLayoutKey = new PluginKey<{ pos: number | null }>("boardLayout");
const widgets = new Set(["textBox", "checklist", "copyfields", "template", "calc"]);

export function activeBoard(state: CommandProps["state"]) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name !== "boardCell") continue;
    const board = $from.node(depth - 1);
    return { board, boardPos: $from.before(depth - 1), cell: $from.node(depth), cellPos: $from.before(depth), index: $from.index(depth - 1) };
  }
  return null;
}
export function boardAtCell(state: CommandProps["state"], cellPos: number) {
  if (state.doc.nodeAt(cellPos)?.type.name !== "boardCell") return null;
  const $pos = state.doc.resolve(cellPos + 1);
  const depth = $pos.depth;
  return { board: $pos.node(depth - 1), boardPos: $pos.before(depth - 1), cell: $pos.node(depth), cellPos, index: $pos.index(depth - 1) };
}
function entries(board: Node) {
  const cells: (CellLayout & { node: Node; original: number })[] = [];
  board.forEach((node, _offset, index) => cells.push({ col: node.attrs.col, span: node.attrs.span, row: node.attrs.row, node, original: index }));
  return cells;
}
function selectCell(tr: CommandProps["tr"], boardPos: number, cells: readonly Node[], index: number) {
  const position = boardPos + 2 + cells.slice(0, index).reduce((size, cell) => size + cell.nodeSize, 0);
  focusCellContent(tr, position - 1);
  return position - 1;
}
function focusCellContent(tr: CommandProps["tr"], cellPos: number, gapAtStart = false) {
  const end = cellPos + tr.doc.nodeAt(cellPos)!.nodeSize - 1;
  const text = TextSelection.findFrom(tr.doc.resolve(cellPos + 1), 1, true);
  // Yalnız medya taşıyan hücrede imleç komşu hücreye kaçmaz; gapcursor yazıma izin verir.
  tr.setSelection(text && text.from < end ? text : new GapCursor(tr.doc.resolve(gapAtStart ? cellPos + 1 : end)));
}
function boardDOM(attributes: Record<string, string>) {
  const dom = document.createElement("div");
  // ProseMirror style.cssText kullanınca Chromium grid-column/row'u grid-area'ya çevirir.
  // Kayda giren kanonik dize DOM özniteliği olarak doğrudan yazılır.
  for (const [name, value] of Object.entries(attributes)) dom.setAttribute(name, value);
  return { dom, contentDOM: dom };
}
function finish(tr: CommandProps["tr"], dispatch: CommandProps["dispatch"]) {
  if (dispatch) { closeHistory(tr); tr.scrollIntoView(); }
  return true;
}
function applyCellLayout(props: CommandProps, active: NonNullable<ReturnType<typeof activeBoard>>, target: BoardTarget, layoutMode: boolean) {
  const { tr, dispatch } = props;
  const current = entries(active.board);
  const ordered = boardTargetLayout(current, active.index, target);
  if (ordered.every((cell, index) => cell.original === index && cell.col === current[index].col && cell.span === current[index].span && cell.row === current[index].row)) {
    if (dispatch && !tr.steps.length) tr.setMeta("preventDispatch", true);
    return true;
  }
  if (dispatch) {
    // Önceki yazım geçmişi ve sonraki hareket ayrı geri alma adımlarıdır.
    closeHistory(tr);
    const cells = ordered.map((cell) => cell.node.type.create({ col: cell.col, span: cell.span, row: cell.row }, cell.node.content));
    if (ordered.some((cell, index) => cell.original !== index)) {
      tr.replaceWith(active.boardPos, active.boardPos + active.board.nodeSize, active.board.type.create(null, cells));
    } else {
      let pos = active.boardPos + 1;
      cells.forEach((cell, index) => {
        if (!cell.sameMarkup(active.board.child(index))) tr.setNodeMarkup(pos, undefined, cell.attrs);
        pos += cell.nodeSize;
      });
    }
    const cellPos = selectCell(tr, active.boardPos, cells, ordered.findIndex((cell) => cell.original === active.index));
    tr.setMeta(boardLayoutKey, { pos: layoutMode ? cellPos : null });
  }
  return finish(tr, dispatch);
}
function unwrap({ state, tr, dispatch }: CommandProps) {
  const active = activeBoard(state);
  if (!active) return false;
  if (dispatch) {
    const blocks: Node[] = [];
    active.board.forEach((cell) => cell.forEach((block) => blocks.push(block)));
    tr.replaceWith(active.boardPos, active.boardPos + active.board.nodeSize, blocks);
    tr.setSelection(TextSelection.near(tr.doc.resolve(active.boardPos + 1)));
    tr.setMeta(boardLayoutKey, { pos: null });
  }
  return finish(tr, dispatch);
}

export const Board = TiptapNode.create({
  name: "board", group: "block", content: "boardCell+", isolating: true, defining: true,
  parseHTML() { return [{ tag: 'div.htnote-board[data-htnote-layout="board"]', getAttrs: (element) => readBoard(element.outerHTML) ? {} : false }]; },
  renderHTML() { return boardDOM({ class: "htnote-board", "data-htnote-layout": "board", style: BOARD_STYLE }); },
  addCommands() {
    return {
      insertBoard: () => ({ state, tr, dispatch }) => {
        if (activeBoard(state)) return false;
        const { $from } = state.selection;
        if (dispatch) {
          const paragraph = state.schema.nodes.paragraph;
          const cells = [{ col: 1, span: 7, row: 1 }, { col: 8, span: 5, row: 1 }].map((attrs) => state.schema.nodes.boardCell.create(attrs, paragraph.create()));
          const empty = $from.depth === 1 && $from.parent.type.name === "paragraph" && !$from.parent.content.size;
          const position = empty ? $from.before(1) : $from.depth ? $from.after(1) : state.selection.to;
          tr.replaceWith(position, empty ? $from.after(1) : position, this.type.create(null, cells));
          if (position + tr.doc.nodeAt(position)!.nodeSize === tr.doc.content.size) tr.insert(tr.doc.content.size, paragraph.create());
          selectCell(tr, position, cells, 0);
        }
        return finish(tr, dispatch);
      },
      addBoardCell: () => ({ state, tr, dispatch }) => {
        const active = activeBoard(state);
        if (!active) return false;
        const current = entries(active.board);
        const layout = addedCellLayout(current, active.index);
        if (!layout) return false;
        if (dispatch) {
          const node = state.schema.nodes.boardCell.create(layout, state.schema.nodes.paragraph.create());
          const ordered = resolveLayout([...current, { ...layout, node, original: current.length }], current.length);
          const cells = ordered.map((cell) => cell.node.type.create({ col: cell.col, span: cell.span, row: cell.row }, cell.node.content));
          tr.replaceWith(active.boardPos, active.boardPos + active.board.nodeSize, active.board.type.create(null, cells));
          selectCell(tr, active.boardPos, cells, ordered.findIndex((cell) => cell.original === current.length));
          tr.setMeta(boardLayoutKey, { pos: null });
        }
        return finish(tr, dispatch);
      },
      removeBoardCell: () => (props) => {
        const { state, tr, dispatch } = props;
        const active = activeBoard(state);
        if (!active) return false;
        if (active.board.childCount === 1) return unwrap(props);
        if (dispatch) {
          const current = entries(active.board);
          const target = active.index ? active.index - 1 : 1;
          current[target].node = current[target].node.copy(active.index
            ? current[target].node.content.append(active.cell.content) : active.cell.content.append(current[target].node.content));
          const ordered = resolveLayout(current.filter((_, index) => index !== active.index), -1);
          const cells = ordered.map((cell) => cell.node.type.create({ col: cell.col, span: cell.span, row: cell.row }, cell.node.content));
          tr.replaceWith(active.boardPos, active.boardPos + active.board.nodeSize, active.board.type.create(null, cells));
          selectCell(tr, active.boardPos, cells, ordered.findIndex((cell) => cell.original === target));
          tr.setMeta(boardLayoutKey, { pos: null });
        }
        return finish(tr, dispatch);
      },
      dissolveBoard: () => unwrap,
      toggleBoardLayout: () => ({ state, tr, dispatch }) => {
        const active = activeBoard(state);
        if (!active) return false;
        if (dispatch) {
          focusCellContent(tr, active.cellPos);
          tr.setMeta(boardLayoutKey, { pos: boardLayoutKey.getState(state)?.pos === active.cellPos ? null : active.cellPos }).setMeta("addToHistory", false);
        }
        return true;
      },
      moveBoardCell: (key, resize = false) => (props) => {
        const { state } = props;
        const active = activeBoard(state);
        if (!active) return false;
        const current = entries(active.board);
        const moved = current[active.index];
        if (key === "ArrowLeft" || key === "ArrowRight") {
          const delta = key === "ArrowLeft" ? -1 : 1;
          // Shift+sol sağ kenarı daraltır, Shift+sağ genişletir.
          if (resize) moved.span = Math.max(1, Math.min(13 - moved.col, moved.span + delta));
          else moved.col = Math.max(1, Math.min(13 - moved.span, moved.col + delta));
        } else if (key === "ArrowUp" || key === "ArrowDown") moved.row = Math.max(1, Math.min(100, moved.row + (key === "ArrowUp" ? -1 : 1)));
        else return false;
        return applyCellLayout(props, active, { ...moved, insertRow: false }, true);
      },
      setBoardCellLayout: (cellPos, target) => (props) => {
        const active = boardAtCell(props.state, cellPos);
        if (!active || !validCell(target)) { if (props.dispatch && !props.tr.steps.length) props.tr.setMeta("preventDispatch", true); return false; }
        return applyCellLayout(props, active, target, boardLayoutKey.getState(props.state)?.pos !== null);
      },
    };
  },
  addKeyboardShortcuts() {
    return { "Mod-Alt-l": () => this.editor.commands.toggleBoardLayout() };
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: boardLayoutKey,
      state: {
        init: () => ({ pos: null }),
        apply: (tr, previous) => {
          const explicit = tr.getMeta(boardLayoutKey);
          if (explicit) return explicit;
          const pos = previous.pos === null ? null : tr.mapping.map(previous.pos);
          const active = activeBoard({ selection: tr.selection } as CommandProps["state"]);
          return { pos: active?.cellPos === pos ? pos : null };
        },
      },
      filterTransaction: (tr) => {
        if (!tr.docChanged) return true;
        let valid = true;
        tr.doc.descendants((node, pos) => {
          // Bu düğümler pano barındıramaz; metin/atom içeriğini her tuşta gezme.
          if (!valid || node.isTextblock || node.isAtom || node.isLeaf) return false;
          if (node.type.name !== "board") return;
          const $pos = tr.doc.resolve(pos);
          for (let depth = 1; depth <= $pos.depth; depth++) if ($pos.node(depth).type.name === "board") valid = false;
          if (!validLayout(entries(node))) valid = false;
          // Geçerli panonun kapsayıcılarını iç içe pano kontrolü için gezmeye devam et.
          return valid;
        });
        return valid;
      },
      appendTransaction: (transactions, _old, state) => {
        if (!transactions.some((tr) => tr.docChanged)) return null;
        const tr = state.tr;
        const ends: number[] = [];
        state.doc.descendants((node, pos) => {
          if (node.isTextblock || node.isAtom || node.isLeaf) return false;
          if (node.type.name !== "boardCell") return;
          if (widgets.has(node.lastChild?.type.name ?? "")) ends.push(pos + node.nodeSize - 1);
          // Filtre iç içe panoyu reddeder; hücre çocuklarında başka hücre bulunamaz.
          return false;
        });
        for (const pos of ends.reverse()) tr.insert(pos, state.schema.nodes.paragraph.create());
        if (state.doc.lastChild?.type.name === "board") tr.insert(tr.doc.content.size, state.schema.nodes.paragraph.create());
        return tr.docChanged ? tr : null;
      },
      view: (view) => {
        // Atom widget girdileri ProseMirror olaylarını durdurur; iki paylaşılan
        // dinleyici etkin hücreyi ve yerleşim kısayolunu bu girdilerde de korur.
        const focus = (event: FocusEvent) => {
          if (!(event.target instanceof Element) || !event.target.matches("input,textarea")) return;
          const cell = event.target.closest(".htnote-board-cell");
          if (!cell) return;
          const pos = view.posAtDOM(cell, 0);
          if (activeBoard(view.state)?.cellPos === pos - 1) return;
          view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(pos))));
        };
        const keydown = (event: KeyboardEvent) => {
          if (!(event.target instanceof Element) || !event.target.matches("input,textarea") || !activeBoard(view.state)) return;
          const mod = getPlatform() === "mac" ? event.metaKey : event.ctrlKey;
          const shortcut = mod && event.altKey && !event.shiftKey && (event.code === "KeyL" || event.key.toLowerCase() === "l");
          const layout = boardLayoutKey.getState(view.state)?.pos !== null;
          if (shortcut || layout && ["Enter", "Escape"].includes(event.key)) this.editor.chain().toggleBoardLayout().focus().run();
          else if (layout && !event.ctrlKey && !event.metaKey && !event.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) this.editor.chain().moveBoardCell(event.key, event.shiftKey).focus().run();
          else return;
          event.preventDefault(); event.stopPropagation();
        };
        view.dom.addEventListener("focusin", focus);
        view.dom.addEventListener("keydown", keydown, true);
        return { destroy: () => { view.dom.removeEventListener("focusin", focus); view.dom.removeEventListener("keydown", keydown, true); } };
      },
      props: { handleKeyDown: (view, event) => {
        const active = activeBoard(view.state);
        if (!active) return false;
        if (boardLayoutKey.getState(view.state)?.pos !== null) {
          if (event.key === "Enter" || event.key === "Escape") {
            this.editor.commands.toggleBoardLayout(); event.preventDefault(); return true;
          }
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
            this.editor.commands.moveBoardCell(event.key, event.shiftKey); event.preventDefault(); return true;
          }
        }
        const { $from, empty } = view.state.selection;
        if (!empty) return false;
        if (event.key === "Backspace" && $from.pos === active.cellPos + 2) return true;
        const end = active.cellPos + active.cell.nodeSize - (view.state.selection instanceof GapCursor ? 1 : 2);
        if (event.key === "ArrowRight" && $from.pos === end || event.key === "ArrowDown" && $from.pos === end && (view.state.selection instanceof GapCursor || view.endOfTextblock("down"))) {
          const after = active.cellPos + active.cell.nodeSize;
          const tr = view.state.tr;
          if (active.index < active.board.childCount - 1) focusCellContent(tr, after, true);
          else {
            const position = Math.min(active.boardPos + active.board.nodeSize + 1, view.state.doc.content.size);
            tr.setSelection(TextSelection.near(view.state.doc.resolve(position)));
          }
          view.dispatch(tr);
          return true;
        }
        return false;
      } },
    })];
  },
});

export const BoardCell = TiptapNode.create({
  name: "boardCell", isolating: true, defining: true,
  content: "(paragraph | heading | bulletList | orderedList | blockquote | codeBlock | horizontalRule | table | htmlBlock | textBox | checklist | copyfields | template | calc | image | audio | video)+",
  addAttributes() { return { col: { default: 1, rendered: false }, span: { default: 12, rendered: false }, row: { default: 1, rendered: false } }; },
  parseHTML() { return [{ tag: "div.htnote-board-cell[data-htnote-cell]", getAttrs: (element) => parseCell(element.getAttribute("data-htnote-cell") ?? "") ?? false }]; },
  renderHTML({ node }) {
    const layout = node.attrs as CellLayout;
    return boardDOM({ class: "htnote-board-cell", "data-htnote-cell": cellValue(layout), style: cellStyle(layout) });
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "htnote-board-cell";
      let previous = "";
      const update = (current: Node) => {
        if (current.type.name !== this.name) return false;
        const layout = current.attrs as CellLayout;
        const value = cellValue(layout);
        if (value !== previous) { dom.setAttribute("data-htnote-cell", value); dom.setAttribute("style", cellStyle(layout)); previous = value; }
        return true;
      };
      update(node);
      return { dom, contentDOM: dom, update,
        // Paylaşılan fare katmanının geçici stilleri belge mutasyonu değildir.
        ignoreMutation: (mutation) => mutation.type === "attributes" && mutation.target === dom };
    };
  },
});
