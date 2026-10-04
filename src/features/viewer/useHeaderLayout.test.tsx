import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useHeaderLayout } from "./useHeaderLayout";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("measures natural widths on resize and restores full metadata when space returns", () => {
  let available = 800;
  let title = 180;
  let resize: (() => void) | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const width = this.hasAttribute("data-test-header") ? available : Number(this.dataset.width ?? 0);
    return { width } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => available);
  function Header() {
    const ref = useRef<HTMLDivElement>(null);
    const layout = useHeaderLayout(ref, `note:${title}`, 2);
    return <div data-test-header><div ref={ref} data-header-content>
      <h2 data-testid="note-title"><span data-title-natural data-width={title} /></h2>
      <span data-path-natural data-width="120" />
      <span data-saved-natural data-width="200" />
      <span data-tag-measure data-width="70" />
      <span data-tag-measure data-width="100" />
      <span data-tag-add data-width="80" />
      <span data-tag-overflow-measure data-width="32" />
      <output data-testid="layout">{JSON.stringify(layout)}</output>
    </div></div>;
  }
  const { unmount, rerender } = render(<Header />);
  expect(JSON.parse(screen.getByTestId("layout").textContent!)).toEqual({ titleWidth: 180, pathWidth: 120, savedWidth: 200, visibleTags: 2, compactLevel: 0 });
  available = 470;
  act(() => resize?.());
  expect(JSON.parse(screen.getByTestId("layout").textContent!)).toEqual({ titleWidth: 180, pathWidth: 24, savedWidth: 0, visibleTags: 1, compactLevel: 0 });
  available = 800;
  act(() => resize?.());
  expect(JSON.parse(screen.getByTestId("layout").textContent!)).toEqual({ titleWidth: 180, pathWidth: 120, savedWidth: 200, visibleTags: 2, compactLevel: 0 });
  expect(disconnect).not.toHaveBeenCalled();
  title = 80;
  rerender(<Header />);
  expect(JSON.parse(screen.getByTestId("layout").textContent!).titleWidth).toBe(80);
  unmount();
  expect(disconnect).toHaveBeenCalledTimes(2);
});

it("folds tags before action labels, keeps the folded layout stable and restores on widening", () => {
  let width = 1100;
  let resize: (() => void) | undefined;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const level = Number(this.closest<HTMLElement>("[data-test-header]")?.dataset.compactLevel ?? 0);
    return { width: this.hasAttribute("data-header-actions") ? (level >= 1 ? 250 : 400) : Number(this.dataset.width ?? 0) } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  function Header() {
    const ref = useRef<HTMLDivElement>(null);
    const layout = useHeaderLayout(ref, "editing", 2);
    return <div data-test-header data-compact-level={layout.compactLevel}>
      <div ref={ref} data-header-content>
        <h2 data-testid="note-title"><span data-title-natural data-width="240" /></h2>
        <span data-path-natural data-width="100" />
        <span data-saved-natural data-width="180" />
        <span data-session-status data-width="90" />
        <span data-tag-measure data-width="70" /><span data-tag-measure data-width="80" />
        <span data-tag-add data-width="40" /><span data-tag-overflow-measure data-width="32" />
      </div>
      <div data-header-actions><span data-action-text data-action-priority="1" data-width="150" style={{ visibility: layout.compactLevel >= 1 ? "hidden" : "visible" }} /></div>
      <output data-testid="layout">{JSON.stringify(layout)}</output>
    </div>;
  }
  render(<Header />);
  const result = () => JSON.parse(screen.getByTestId("layout").textContent!);
  expect(result().compactLevel).toBe(0);
  expect(result().visibleTags).toBe(2);
  width = 870;
  act(() => resize?.());
  expect(result().compactLevel).toBe(0);
  expect(result().visibleTags).toBe(0);
  width = 790;
  act(() => resize?.());
  expect(result().compactLevel).toBe(1);
  act(() => resize?.());
  expect(result().compactLevel).toBe(1);
  width = 1100;
  act(() => resize?.());
  expect(result().compactLevel).toBe(0);
  expect(result().visibleTags).toBe(2);
});
