import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Tooltip } from "./Tooltip";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 28, height: 28, left: 0, top: 0, bottom: 28 } as DOMRect);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function keyboardFocus(button: HTMLElement) {
  vi.spyOn(button, "matches").mockImplementation((selector) => selector === ":focus-visible");
  act(() => button.focus());
}

describe("Tooltip", () => {
  it("opens after 400ms, uses a portal and preserves existing descriptions", () => {
    const { container } = render(<Tooltip label="Save" shortcut="Ctrl+S"><button aria-describedby="help">Save</button></Tooltip>);
    const button = screen.getByRole("button");
    fireEvent.mouseEnter(button);
    act(() => vi.advanceTimersByTime(399));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.parentElement).toBe(document.body);
    expect(container).not.toContainElement(tooltip);
    expect(button).toHaveAttribute("aria-describedby", `help ${tooltip.id}`);
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-describedby", "help");
  });

  it("cancels a pending hover on leave, Escape and unmount", () => {
    const { unmount } = render(<Tooltip label="Save"><button>Save</button></Tooltip>);
    const button = screen.getByRole("button");
    fireEvent.mouseEnter(button);
    fireEvent.mouseLeave(button);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(button);
    fireEvent.keyDown(document, { key: "Escape" });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(button);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("opens on keyboard focus, closes on blur and keeps child event handlers", () => {
    const focus = vi.fn();
    const click = vi.fn();
    render(<Tooltip label="Save"><button onFocus={focus} onClick={click}>Save</button></Tooltip>);
    const button = screen.getByRole("button");
    keyboardFocus(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(focus).toHaveBeenCalledOnce();
    fireEvent.click(button);
    expect(click).toHaveBeenCalledOnce();
    fireEvent.blur(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not open on pointer or programmatic focus and closes hover despite that focus", () => {
    render(<Tooltip label="Save"><button>Save</button></Tooltip>);
    const button = screen.getByRole("button");
    vi.spyOn(button, "matches").mockReturnValue(false);
    fireEvent.pointerDown(button);
    act(() => button.focus());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(button);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keeps a keyboard tooltip open on mouse leave", () => {
    render(<Tooltip label="Save"><button>Save</button></Tooltip>);
    const button = screen.getByRole("button");
    keyboardFocus(button);
    fireEvent.mouseLeave(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it.each(["inert", "aria-hidden", "hidden", "style"])("closes without blur when an ancestor becomes %s", async (attribute) => {
    const { container } = render(<div><Tooltip label="Save"><button>Save</button></Tooltip></div>);
    keyboardFocus(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await act(async () => container.firstElementChild!.setAttribute(attribute,
      attribute === "aria-hidden" ? "true" : attribute === "style" ? "visibility: hidden" : ""));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not open a pending hover in a panel that has closed", () => {
    const { container } = render(<Tooltip label="Save"><button>Save</button></Tooltip>);
    fireEvent.mouseEnter(screen.getByRole("button"));
    container.setAttribute("inert", "");
    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes when the anchor is detached without unmounting", async () => {
    const { container } = render(<Tooltip label="Save"><button>Save</button></Tooltip>);
    keyboardFocus(screen.getByRole("button"));
    await act(async () => container.remove());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes when the anchor shrinks to zero", () => {
    let resize = () => {};
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    render(<Tooltip label="Save"><button>Save</button></Tooltip>);
    keyboardFocus(screen.getByRole("button"));
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({ width: 0, height: 0 } as DOMRect);
    act(() => resize());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
