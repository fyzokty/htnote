import { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createVisualExtensions } from "./extensions";
import { installBlockPointer } from "./blockPointer";

let editor: Editor;
let pointer: ReturnType<typeof installBlockPointer>;
let layer: HTMLElement, handle: HTMLElement, chip: HTMLElement, indicator: HTMLElement, hint: HTMLElement;
let frames: Map<number, FrameRequestCallback>, transactions: number;
const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((frame) => frame(0)); };
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
function event(target: Element, type: string, x: number, y: number, id = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: id });
  target.dispatchEvent(event); return event as PointerEvent;
}
beforeEach(() => {
  frames = new Map(); let id = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const element = document.createElement("div"); document.body.append(element);
  editor = new Editor({ element, extensions: createVisualExtensions(""), content: "<p>First</p><p>Second</p>" });
  const paragraphs = editor.view.dom.querySelectorAll("p");
  paragraphs[0].getBoundingClientRect = () => new DOMRect(40, 100, 400, 30);
  paragraphs[1].getBoundingClientRect = () => new DOMRect(40, 160, 400, 30);
  vi.spyOn(editor.view, "posAtCoords").mockImplementation(({ top }) => ({ pos: top < 140 ? 1 : 8, inside: -1 }));
  document.elementFromPoint = vi.fn((_x, y) => paragraphs[y < 140 ? 0 : 1]);
  layer = document.createElement("div"); handle = document.createElement("button"); handle.dataset.blockHandle = ""; layer.append(handle);
  chip = document.createElement("div"); chip.append(document.createElement("span")); chip.firstElementChild!.setAttribute("data-block-preview", "");
  indicator = document.createElement("div"); hint = document.createElement("div"); document.body.append(layer, chip, indicator, hint);
  let captured = false; handle.setPointerCapture = () => { captured = true; }; handle.hasPointerCapture = () => captured; handle.releasePointerCapture = () => { captured = false; };
  pointer = installBlockPointer(editor, layer, handle, chip, indicator, hint);
  pointer.hover(event(paragraphs[1], "pointermove", 200, 170)); flush();
  transactions = 0; editor.on("transaction", () => transactions++);
});
afterEach(() => { pointer.destroy(); editor.destroy(); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(["Escape", "pointercancel", "lostpointercapture"])("cancels %s after twenty frames without changing the document", async (kind) => {
  const before = editor.state.doc;
  event(handle, "pointerdown", 25, 170);
  for (let i = 0; i < 20; i++) { event(document.body, "pointermove", 430, 120); flush(); }
  await settle(); expect(transactions).toBe(0);
  if (kind === "Escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  else event(kind === "lostpointercapture" ? handle : document.body, kind, 430, 120);
  event(document.body, "pointerup", 430, 120); await settle();
  expect(editor.state.doc).toBe(before); expect(transactions).toBe(0);
});
it("previews with zero transactions then creates a board with one transaction and one undo", async () => {
  const before = editor.getJSON(); event(handle, "pointerdown", 25, 170);
  for (let i = 0; i < 20; i++) { event(document.body, "pointermove", 430, 120); flush(); }
  await settle(); expect(transactions).toBe(0);
  event(document.body, "pointerup", 430, 120); await settle();
  expect(transactions).toBe(1); expect(editor.state.doc.firstChild?.type.name).toBe("board");
  expect(editor.state.doc.firstChild?.child(1).textContent).toBe("Second");
  editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
});
it("selects the whole text on a click and does not transact for an unchanged drop", () => {
  event(handle, "pointerdown", 25, 170); event(document.body, "pointerup", 25, 170);
  expect(editor.state.selection).toBeInstanceOf(TextSelection);
  expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe("Second");
  const paragraph = editor.view.dom.querySelectorAll("p")[1]; pointer.hover(event(paragraph, "pointermove", 200, 170)); flush(); transactions = 0;
  event(handle, "pointerdown", 25, 170); event(document.body, "pointermove", 200, 165); flush(); event(document.body, "pointerup", 200, 165);
  expect(transactions).toBe(0);
});
it("uses the same mechanism for the widget header and selects it on click", () => {
  editor.commands.insertContentAt(0, { type: "checklist" });
  const widget = document.createElement("span"); widget.className = "htnote-widget-handle"; (editor.view.nodeDOM(0) as HTMLElement).append(widget);
  widget.setPointerCapture = handle.setPointerCapture; widget.hasPointerCapture = handle.hasPointerCapture; widget.releasePointerCapture = handle.releasePointerCapture;
  event(widget, "pointerdown", 400, 100); event(document.body, "pointerup", 400, 100);
  expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  expect((editor.state.selection as NodeSelection).node.type.name).toBe("checklist");
});
it("ignores other pointer IDs and cancels when the source document changes", () => {
  event(handle, "pointerdown", 25, 170); event(document.body, "pointercancel", 0, 0, 2);
  expect(pointer.isDragging()).toBe(true);
  editor.commands.insertContentAt(editor.state.doc.content.size, "<p>External</p>");
  expect(pointer.isDragging()).toBe(false);
});
