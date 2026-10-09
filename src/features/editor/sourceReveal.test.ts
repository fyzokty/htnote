import { EditorState } from "@codemirror/state";
import { html } from "@codemirror/lang-html";
import { describe, expect, it, vi } from "vitest";

import { findSourceRange, registerSourceReveal, revealSource } from "./sourceReveal";
import { sourceHighlight, sourceHighlightField } from "./codeState";

const stateFor = (doc: string) => EditorState.create({ doc, extensions: [html()] });

describe("findSourceRange", () => {
  it("counts widgets in document order, including board cells, excluding raw script/textarea text", () => {
    const first = '<div data-htnote-widget="textbox"><textarea><div data-htnote-widget="calc">fake</div></textarea></div>';
    const nested = "<section data-htnote-widget='calc'><p>2 + 2</p></section>";
    const last = '<div data-htnote-widget=ipblock><pre>10.0.0.2</pre></div>';
    const doc = '<script>const fake = `<div data-htnote-widget="calc"></div>`;</script>' + first
      + '<main id="htnote-content"><div data-htnote-layout="board"><div data-htnote-cell="1 12 1">' + nested + '</div></div>' + last + '</main>';
    const state = stateFor(doc);
    for (const [index, widget, source] of [[0, "textbox", first], [1, "calc", nested], [2, "ipblock", last]] as const) {
      const from = doc.indexOf(source);
      expect(findSourceRange(state, { kind: "widget", index, widget })).toEqual({ from, to: from + source.length });
    }
    expect(findSourceRange(state, { kind: "widget", index: 1, widget: "textbox" })).toBeNull();
    expect(findSourceRange(state, { kind: "widget", index: 3, widget: "calc" })).toBeNull();
  });

  it("keeps unknown widget markers in the index and handles HTML attribute/tag casing", () => {
    const doc = '<div data-htnote-widget="unknown"></div><DIV DATA-HTNOTE-WIDGET="checklist"></DIV>';
    const state = stateFor(doc);
    expect(findSourceRange(state, { kind: "widget", index: 0, widget: "checklist" })).toBeNull();
    expect(findSourceRange(state, { kind: "widget", index: 1, widget: "checklist" })).toEqual({ from: doc.indexOf("<DIV"), to: doc.length });
  });

  it("maps only direct element children of the content main, including void elements", () => {
    const board = '<div data-htnote-layout="board"><div><p>Nested</p></div></div>';
    const doc = '<main id="other"><p>Other</p></main><MAIN ID=htnote-content>text<!-- comment --><h2>Title</h2>' + board + '<img src="x"></MAIN>';
    const state = stateFor(doc);
    for (const [index, tag, source] of [[0, "h2", "<h2>Title</h2>"], [1, "div", board], [2, "img", '<img src="x">']] as const) {
      const from = doc.indexOf(source);
      expect(findSourceRange(state, { kind: "block", index, tag })).toEqual({ from, to: from + source.length });
    }
    expect(findSourceRange(state, { kind: "block", index: 1, tag: "p" })).toBeNull();
    expect(findSourceRange(state, { kind: "block", index: 3, tag: "img" })).toBeNull();
  });

  it("returns null without the content main and for invalid indices", () => {
    const state = stateFor('<main id="other"><p>Text</p></main>');
    expect(findSourceRange(state, { kind: "block", index: 0, tag: "p" })).toBeNull();
    for (const index of [-1, 0.5, 10000, NaN]) {
      expect(findSourceRange(state, { kind: "widget", index, widget: "calc" })).toBeNull();
    }
  });
});

it("registers by note id and does not unregister a replacement handler", () => {
  const locator = { kind: "block", index: 0, tag: "p" } as const;
  const first = vi.fn(), second = vi.fn(), other = vi.fn();
  expect(revealSource("missing", locator)).toBe(false);
  const unregisterFirst = registerSourceReveal("note", first);
  const unregisterOther = registerSourceReveal("other", other);
  expect(revealSource("note", locator)).toBe(true);
  expect(first).toHaveBeenCalledExactlyOnceWith(locator);
  expect(other).not.toHaveBeenCalled();
  const unregisterSecond = registerSourceReveal("note", second);
  unregisterFirst();
  expect(revealSource("note", locator)).toBe(true);
  expect(second).toHaveBeenCalledExactlyOnceWith(locator);
  unregisterSecond();
  unregisterOther();
  expect(revealSource("note", locator)).toBe(false);
  expect(revealSource("other", locator)).toBe(false);
});

it("maps the temporary highlight through edits and removes it with an effect", () => {
  let state = EditorState.create({ doc: "before target after", extensions: [sourceHighlightField] });
  state = state.update({ effects: sourceHighlight.of({ from: 7, to: 13, reduced: true }) }).state;
  state = state.update({ changes: { from: 0, insert: "new " } }).state;
  const ranges: { from: number; to: number }[] = [];
  state.field(sourceHighlightField).between(0, state.doc.length, (from, to) => { ranges.push({ from, to }); });
  expect(ranges).toEqual([{ from: 11, to: 17 }]);
  state = state.update({ changes: { from: 11, to: 17 } }).state;
  expect(state.field(sourceHighlightField).size).toBe(0);
  state = state.update({ effects: sourceHighlight.of(null) }).state;
  expect(state.field(sourceHighlightField).size).toBe(0);
});
