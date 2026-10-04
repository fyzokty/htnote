import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IconButton } from "@/components/ui/IconButton";
import { formatShortcut } from "@/lib/shortcuts/registry";
import { ToolbarGroups } from "./ToolbarGroups";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("remeasures reordered overflow groups, restores controls and shows shortcut tooltips in the panel", () => {
  vi.useFakeTimers();
  let width = 1600;
  let resize = () => {};
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: () => void) {}
    observe(element: HTMLElement) { if (element.classList.contains("htnote-toolbar-groups")) resize = this.callback; }
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  const widths = [73, 320, 177, 177, 209, 107, 141];
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { width: widths[Number(this.dataset.toolbarGroup)] ?? 28, height: 32, left: 0, top: 0, right: 28, bottom: 32 } as DOMRect;
  });
  render(<ToolbarGroups groups={widths.map((_, index) => <IconButton key={index} label={`Tool ${index}`}
    shortcut={index === 0 ? formatShortcut("editorUndo") : undefined}><svg /></IconButton>)} />);
  expect(screen.queryByTestId("editor-overflow")).not.toBeInTheDocument();
  width = 800;
  act(() => resize());
  expect(document.querySelector('.htnote-toolbar-measure [data-toolbar-group="4"]')).toBeInTheDocument();
  expect(document.querySelector('.htnote-toolbar-groups > [data-toolbar-group="0"]')).toBeInTheDocument();
  act(() => resize());
  expect(document.querySelector('.htnote-toolbar-groups > [data-toolbar-group="0"]')).toBeInTheDocument();
  width = 60;
  act(() => resize());
  fireEvent.click(screen.getByTestId("editor-overflow"));
  const undo = screen.getByRole("button", { name: "Tool 0" });
  fireEvent.mouseEnter(undo.parentElement!);
  act(() => vi.advanceTimersByTime(400));
  expect(screen.getAllByRole("tooltip").some((tip) => tip.textContent?.includes(formatShortcut("editorUndo")))).toBe(true);
  fireEvent.mouseLeave(undo.parentElement!);
  vi.spyOn(undo, "matches").mockImplementation((selector) => selector === ":focus-visible");
  act(() => { screen.getByTestId("editor-overflow").focus(); undo.focus(); });
  expect(undo).toHaveAttribute("aria-describedby");
  fireEvent.keyDown(undo, { key: "Escape" });
  expect(screen.getByTestId("editor-overflow")).toHaveFocus();
  width = 1600;
  act(() => resize());
  expect(screen.queryByTestId("editor-overflow")).not.toBeInTheDocument();
});

it("leaves no tooltip after pointer overflow toggles, outside close or group relocation", async () => {
  vi.useFakeTimers();
  let width = 60;
  let resize = () => {};
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: () => void) {}
    observe(element: HTMLElement) { if (element.classList.contains("htnote-toolbar-groups")) resize = this.callback; }
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 100, height: 32, left: 0, top: 0, bottom: 32 } as DOMRect);
  const { unmount } = render(<ToolbarGroups groups={[
    <IconButton key="table" label="Table"><svg /></IconButton>,
    <IconButton key="next" label="Next"><svg /></IconButton>,
  ]} />);
  const trigger = screen.getByTestId("editor-overflow");
  fireEvent.click(trigger, { detail: 1 });
  const table = screen.getByRole("button", { name: "Table" });
  expect(table).not.toHaveFocus();
  act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.mouseEnter(table);
  act(() => vi.advanceTimersByTime(400));
  expect(screen.getByRole("tooltip")).toBeInTheDocument();
  await act(async () => fireEvent.click(trigger, { detail: 1 }));
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.click(trigger, { detail: 1 });
  fireEvent.mouseEnter(table);
  act(() => vi.advanceTimersByTime(400));
  await act(async () => fireEvent.pointerDown(document.body));
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.click(trigger, { detail: 1 });
  fireEvent.mouseEnter(table);
  act(() => vi.advanceTimersByTime(400));
  width = 500;
  act(() => resize());
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(screen.queryByTestId("editor-overflow")).not.toBeInTheDocument();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("focuses keyboard-opened overflow and preserves arrows, Tab and Escape focus return", () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(60);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 100, height: 32, left: 0, top: 0, bottom: 32 } as DOMRect);
  const matches = HTMLElement.prototype.matches;
  vi.spyOn(HTMLElement.prototype, "matches").mockImplementation(function (this: HTMLElement, selector) {
    return selector === ":focus-visible" || matches.call(this, selector);
  });
  render(<ToolbarGroups groups={[
    <IconButton key="table" label="Table"><svg /></IconButton>,
    <IconButton key="next" label="Next"><svg /></IconButton>,
  ]} />);
  const trigger = screen.getByTestId("editor-overflow");
  fireEvent.click(trigger, { detail: 0 });
  const table = screen.getByRole("button", { name: "Table" });
  const next = screen.getByRole("button", { name: "Next" });
  expect(table).toHaveFocus();
  expect(screen.getByRole("tooltip")).toHaveTextContent("Table");
  fireEvent.keyDown(table, { key: "ArrowRight" });
  expect(next).toHaveFocus();
  fireEvent.keyDown(next, { key: "Tab", shiftKey: true });
  expect(table).toHaveFocus();
  fireEvent.keyDown(table, { key: "Escape" });
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
