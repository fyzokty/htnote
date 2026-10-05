import { Editor } from "@tiptap/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createVisualExtensions } from "./extensions";
import { installBoardPointer } from "./boardPointer";
import { serializeBoard } from "./board";
import { wrapRawBlocks } from "./visualPipeline";

let editor: Editor;
let stop: () => void;
let layer: HTMLDivElement;
let frames: Map<number, FrameRequestCallback>;
let transactions: number;
const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((frame) => frame(0)); };
function pointer(target: Element, type: string, x: number, y: number, id = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: id });
  target.dispatchEvent(event);
}
beforeEach(() => {
  frames = new Map(); let id = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const element = document.createElement("div"); document.body.append(element);
  editor = new Editor({ element, extensions: createVisualExtensions(""), content: wrapRawBlocks(serializeBoard([
    { col: 1, span: 7, row: 1, html: "<p>Left</p>" }, { col: 8, span: 5, row: 1, html: "<p>Right</p>" },
  ])) });
  const board = element.querySelector<HTMLElement>(".htnote-board")!;
  const cells = board.querySelectorAll<HTMLElement>(".htnote-board-cell");
  board.getBoundingClientRect = () => new DOMRect(0, 100, 584, 100);
  cells[0].getBoundingClientRect = () => new DOMRect(0, 100, 334, 100);
  cells[1].getBoundingClientRect = () => new DOMRect(350, 100, 234, 100);
  layer = document.createElement("div");
  for (const mode of ["move", "left", "right"]) { const button = document.createElement("button"); button.dataset.boardHandle = mode; layer.append(button); }
  const ghost = document.createElement("div"), label = document.createElement("div");
  document.body.append(layer, ghost, label);
  const captures = new Set<number>();
  layer.setPointerCapture = (id) => { captures.add(id); };
  layer.hasPointerCapture = (id) => captures.has(id);
  layer.releasePointerCapture = (id) => { captures.delete(id); };
  for (const button of layer.querySelectorAll("button")) {
    button.setPointerCapture = layer.setPointerCapture;
    button.hasPointerCapture = layer.hasPointerCapture;
    button.releasePointerCapture = layer.releasePointerCapture;
  }
  stop = installBoardPointer(editor, layer, ghost, label);
  transactions = 0; editor.on("transaction", () => transactions++);
  pointer(cells[1], "pointermove", 350, 100); flush();
});
afterEach(() => { stop(); editor.destroy(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
const handle = (mode = "move") => layer.querySelector(`[data-board-handle="${mode}"]`)!;
const settleMutations = () => new Promise((resolve) => setTimeout(resolve, 30));

it.each(["Escape", "pointercancel", "lostpointercapture"])("cancels %s without any transaction or document change", async (cancel) => {
  const before = editor.state.doc;
  const styles = [...editor.view.dom.querySelectorAll(".htnote-board-cell")].map((cell) => cell.getAttribute("style"));
  pointer(handle(), "pointerdown", 350, 100);
  for (let i = 0; i < 20; i++) { pointer(layer, "pointermove", 350 - i * 10, 100 + i * 8); flush(); }
  await settleMutations(); expect(transactions).toBe(0); expect(editor.state.doc).toBe(before);
  if (cancel === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  else pointer(layer, cancel, 160, 252);
  pointer(layer, "pointerup", 160, 252); flush(); await settleMutations();
  expect(transactions).toBe(0); expect(editor.state.doc).toBe(before);
  expect([...editor.view.dom.querySelectorAll(".htnote-board-cell")].map((cell) => cell.getAttribute("style"))).toEqual(styles);
});
it("previews twenty moves with zero transactions and commits once on release with one undo", async () => {
  const before = editor.getJSON();
  pointer(handle(), "pointerdown", 350, 100);
  for (let i = 1; i <= 20; i++) { pointer(layer, "pointermove", 350, 100 + i * 6); flush(); }
  await settleMutations(); expect(transactions).toBe(0);
  pointer(layer, "pointerup", 350, 220); await settleMutations();
  expect(transactions).toBe(1);
  expect(editor.state.doc.firstChild?.child(1).attrs).toMatchObject({ col: 8, span: 5, row: 2 });
  editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
});
it("does not transact when released without a new layout, including movement within the same column", async () => {
  pointer(handle(), "pointerdown", 350, 100); pointer(layer, "pointerup", 350, 100);
  flush(); pointer(editor.view.dom.querySelectorAll(".htnote-board-cell")[1], "pointermove", 350, 100); flush();
  pointer(handle(), "pointerdown", 350, 100); pointer(layer, "pointermove", 360, 130); flush(); pointer(layer, "pointerup", 360, 130);
  await settleMutations(); expect(transactions).toBe(0);
});
it.each(["left", "right"])("resizes the %s edge, resolves collisions and commits once", async (mode) => {
  const before = editor.getJSON();
  pointer(handle(mode), "pointerdown", mode === "left" ? 350 : 584, 150);
  pointer(layer, "pointermove", mode === "left" ? 300 : 484, 150); flush();
  await settleMutations(); expect(transactions).toBe(0);
  pointer(layer, "pointerup", mode === "left" ? 300 : 484, 150);
  expect(transactions).toBe(1);
  const attrs = editor.state.doc.firstChild?.child(mode === "left" ? 0 : 1).attrs;
  expect(attrs).toMatchObject(mode === "left" ? { col: 7, span: 6, row: 1 } : { col: 8, span: 3, row: 1 });
  editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
});
it("receives a release outside the layer and ignores a second pointer", () => {
  pointer(handle(), "pointerdown", 350, 100);
  pointer(document.body, "pointercancel", 350, 100, 2);
  pointer(document.body, "pointermove", 350, 220); flush();
  pointer(document.body, "pointerup", 350, 220);
  expect(transactions).toBe(1);
  expect(editor.state.doc.firstChild?.child(1).attrs.row).toBe(2);
});
it("remeasures cached row bounds on scroll without transacting", () => {
  const before = editor.state.doc;
  pointer(handle(), "pointerdown", 350, 100);
  pointer(layer, "pointermove", 350, 220); flush();
  const board = editor.view.dom.querySelector<HTMLElement>(".htnote-board")!;
  board.getBoundingClientRect = () => new DOMRect(0, 400, 584, 100);
  const cells = board.querySelectorAll<HTMLElement>(".htnote-board-cell");
  cells[0].getBoundingClientRect = () => new DOMRect(0, 400, 334, 100);
  cells[1].getBoundingClientRect = () => new DOMRect(350, 400, 234, 100);
  document.dispatchEvent(new Event("scroll")); flush();
  pointer(layer, "pointerup", 350, 220);
  expect(transactions).toBe(0); expect(editor.state.doc).toBe(before);
});
