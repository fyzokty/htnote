import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { useTranslation } from "react-i18next";
import { Columns3, GripHorizontal, GripVertical, Type, List, Image, Code, Table, Plus, Trash2, Ungroup } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { activeBoard, boardLayoutKey } from "./boardNodes";
import { MAX_BOARD_CELLS, type CellLayout } from "./board";
import { mediaToolbarOwners, mediaToolbarPosition } from "./mediaToolbarPosition";
import { installBoardPointer } from "./boardPointer";
import { installBlockPointer } from "./blockPointer";
import { editorViewport } from "./editorViewport";

interface Active extends CellLayout { pos: number; count: number; layout: boolean }
export function FloatingBoardToolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<Active | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const handles = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const widthLabel = useRef<HTMLDivElement>(null);
  const blocks = useRef<HTMLDivElement>(null);
  const blockHandle = useRef<HTMLButtonElement>(null);
  const chip = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!handles.current || !ghost.current || !widthLabel.current || !blocks.current || !blockHandle.current || !chip.current || !indicator.current || !hint.current) return;
    const pointer = installBlockPointer(editor, blocks.current, blockHandle.current, chip.current, indicator.current, hint.current);
    const stop = installBoardPointer(editor, handles.current, ghost.current, widthLabel.current, pointer);
    return () => { stop(); pointer.destroy(); };
  }, [editor]);
  useEffect(() => {
    let signature = "";
    const update = () => {
      const current = activeBoard(editor.state);
      const next: Active | null = current ? { pos: current.cellPos, count: current.board.childCount,
        col: current.cell.attrs.col, span: current.cell.attrs.span, row: current.cell.attrs.row,
        layout: boardLayoutKey.getState(editor.state)?.pos === current.cellPos } : null;
      const value = JSON.stringify(next);
      if (value !== signature) { signature = value; setActive(next); }
    };
    update();
    editor.on("transaction", update);
    return () => { editor.off("transaction", update); };
  }, [editor]);
  useEffect(() => {
    if (!active || !menu.current) return;
    const layer = menu.current;
    const outline = frame.current;
    const anchor = editor.view.nodeDOM(active.pos);
    if (!(anchor instanceof HTMLElement)) return;
    const scroll = editor.view.dom.closest(".htnote-visual-scroll");
    mediaToolbarOwners.set(layer, editor.view.dom);
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Ölçümlerin tamamı yazımlardan önce okunur; hücre başına gözlemci yoktur.
        // Üst sınır yapışkan editör araç çubuğunun altıdır; araç çubuğu onun üstüne çizilmez.
        const viewport = editorViewport(scroll) ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
        const bounds = anchor.getBoundingClientRect();
        const size = layer.getBoundingClientRect();
        const position = mediaToolbarPosition(bounds, size, viewport, "right");
        layer.style.left = `${position.left}px`;
        layer.style.top = `${position.top}px`;
        layer.style.maxWidth = `${Math.max(0, viewport.right - viewport.left - 16)}px`;
        layer.style.visibility = position.visible || !bounds.width ? "visible" : "hidden";
        if (outline) {
          outline.style.left = `${bounds.left}px`; outline.style.top = `${bounds.top}px`;
          outline.style.width = `${bounds.width}px`; outline.style.height = `${bounds.height}px`;
          outline.style.clipPath = `inset(${Math.max(0, viewport.top - bounds.top)}px ${Math.max(0, bounds.right - viewport.right)}px ${Math.max(0, bounds.bottom - viewport.bottom)}px ${Math.max(0, viewport.left - bounds.left)}px)`;
        }
      });
    };
    measure();
    document.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf); mediaToolbarOwners.delete(layer);
      document.removeEventListener("scroll", measure, true); window.removeEventListener("resize", measure);
    };
  }, [editor, active]);
  return createPortal(<>
    <div ref={blocks} className="htnote-block-pointer-layer" hidden>
      <button ref={blockHandle} type="button" data-block-handle data-testid="block-handle" className="htnote-block-handle"
        aria-label={t("editor.block.move")} title={t("editor.block.move")}><GripVertical size={16} aria-hidden /></button>
    </div>
    <div ref={chip} className="htnote-block-chip" hidden aria-hidden>
      <Type className="block-icon-text" size={14} /><List className="block-icon-list" size={14} /><Image className="block-icon-media" size={14} />
      <Code className="block-icon-code" size={14} /><Table className="block-icon-table" size={14} /><Columns3 className="block-icon-board" size={14} />
      <span data-block-preview />
    </div>
    <div ref={indicator} className="htnote-block-indicator" hidden aria-hidden />
    <div ref={hint} className="htnote-block-hint" hidden aria-hidden>{t("editor.block.sideBySide")}</div>
    <div ref={handles} className="htnote-board-pointer-layer" hidden>
      <button type="button" tabIndex={-1} data-board-handle="move" data-testid="board-move" className="htnote-board-move-handle"
        aria-label={t("editor.board.move")} title={t("editor.board.pointerHint")}><GripHorizontal size={14} aria-hidden /></button>
      <div data-board-handle="left" data-testid="board-resize-left" className="htnote-board-resize-handle" aria-hidden />
      <div data-board-handle="right" data-testid="board-resize-right" className="htnote-board-resize-handle" aria-hidden />
    </div>
    <div ref={ghost} className="htnote-board-ghost" hidden aria-hidden />
    <div ref={widthLabel} className="htnote-board-width-label" hidden aria-hidden />
    {active && <><div ref={menu} role="toolbar" aria-label={t("editor.board.toolbar")} className="htnote-board-toolbar htnote-popover-surface"
      onMouseDown={(event) => event.preventDefault()}>
      <IconButton size="sm" label={t("editor.board.addCell")} disabled={active.count >= MAX_BOARD_CELLS}
        data-testid="board-add-cell" onClick={() => editor.chain().focus().addBoardCell().run()}><Plus size={16} aria-hidden /></IconButton>
      <IconButton size="sm" label={t("editor.board.removeCell")} data-testid="board-remove-cell"
        onClick={() => editor.chain().focus().removeBoardCell().run()}><Trash2 size={16} aria-hidden /></IconButton>
      <IconButton size="sm" label={t("editor.board.dissolve")} data-testid="board-dissolve"
        onClick={() => editor.chain().focus().dissolveBoard().run()}><Ungroup size={16} aria-hidden /></IconButton>
      <IconButton size="sm" label={t("editor.board.layout")} aria-pressed={active.layout} data-testid="board-layout"
        onClick={() => editor.chain().focus().toggleBoardLayout().run()}><Columns3 size={16} aria-hidden /></IconButton>
    </div>
    {active.layout && <div ref={frame} className="htnote-board-layout-frame" aria-hidden />}
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {active.layout && `${t("editor.board.announcement", { col: active.col, span: active.span, row: active.row })}. ${t("editor.board.layoutHint")}`}
    </div></>}
  </>, document.body);
}
