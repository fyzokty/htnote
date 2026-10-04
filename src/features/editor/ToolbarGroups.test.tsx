import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IconButton } from "@/components/ui/IconButton";
import { formatShortcut } from "@/lib/shortcuts/registry";
import { ToolbarGroups } from "./ToolbarGroups";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("remeasures reordered overflow groups, restores controls and shows shortcut tooltips in the panel", () => {
  vi.useFakeTimers();
  let width = 1138;
  let resize = () => {};
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  const widths = [132, 141, 141, 209, 107, 177, 73];
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { width: widths[Number(this.dataset.toolbarGroup)] ?? 28, height: 32, left: 0, top: 0, right: 28, bottom: 32 } as DOMRect;
  });
  render(<ToolbarGroups groups={widths.map((_, index) => <IconButton key={index} label={`Tool ${index}`}
    shortcut={index === 6 ? formatShortcut("editorUndo") : undefined}><svg /></IconButton>)} />);
  expect(screen.queryByTestId("editor-overflow")).not.toBeInTheDocument();
  width = 800;
  act(() => resize());
  expect(document.querySelector('.htnote-toolbar-overflow [data-toolbar-group="3"]')).toBeInTheDocument();
  expect(document.querySelector('.htnote-toolbar-groups > [data-toolbar-group="6"]')).toBeInTheDocument();
  act(() => resize());
  expect(document.querySelector('.htnote-toolbar-groups > [data-toolbar-group="6"]')).toBeInTheDocument();
  width = 60;
  act(() => resize());
  fireEvent.click(screen.getByTestId("editor-overflow"));
  const undo = screen.getByRole("button", { name: "Tool 6" });
  fireEvent.mouseEnter(undo.parentElement!);
  act(() => vi.advanceTimersByTime(400));
  expect(screen.getAllByRole("tooltip").some((tip) => tip.textContent?.includes(formatShortcut("editorUndo")))).toBe(true);
  fireEvent.mouseLeave(undo.parentElement!);
  act(() => undo.focus());
  expect(undo).toHaveAttribute("aria-describedby");
  fireEvent.keyDown(undo, { key: "Escape" });
  expect(screen.getByTestId("editor-overflow")).toHaveFocus();
  width = 1138;
  act(() => resize());
  expect(screen.queryByTestId("editor-overflow")).not.toBeInTheDocument();
});
