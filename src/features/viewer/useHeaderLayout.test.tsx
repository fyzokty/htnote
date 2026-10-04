import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useHeaderLayout } from "./useHeaderLayout";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("measures natural widths on resize and restores full metadata when space returns", () => {
  let available = 800;
  let resize: (() => void) | undefined;
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const width = this.hasAttribute("data-header-content") ? available : Number(this.dataset.width ?? 0);
    return { width } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(180);
  function Header() {
    const ref = useRef<HTMLDivElement>(null);
    const layout = useHeaderLayout(ref, "note", 2);
    return <div ref={ref} data-header-content>
      <h2 data-testid="note-title" />
      <span data-path-natural data-width="120" />
      <span data-saved-natural data-width="200" />
      <span data-tag-measure data-width="70" />
      <span data-tag-measure data-width="100" />
      <span data-tag-add data-width="80" />
      <span data-tag-overflow-measure data-width="32" />
      <output data-testid="layout">{JSON.stringify(layout)}</output>
    </div>;
  }
  const { unmount } = render(<Header />);
  expect(JSON.parse(screen.getByTestId("layout").textContent!)).toEqual({ pathWidth: 120, savedWidth: 200, visibleTags: 2 });
  available = 470;
  act(() => resize?.());
  expect(JSON.parse(screen.getByTestId("layout").textContent!)).toEqual({ pathWidth: 24, savedWidth: 36, visibleTags: 1 });
  available = 800;
  act(() => resize?.());
  expect(JSON.parse(screen.getByTestId("layout").textContent!)).toEqual({ pathWidth: 120, savedWidth: 200, visibleTags: 2 });
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
