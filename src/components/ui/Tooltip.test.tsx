import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Tooltip } from "./Tooltip";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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

  it("opens on focus, closes on blur and keeps child event handlers", () => {
    const focus = vi.fn();
    const click = vi.fn();
    render(<Tooltip label="Save"><button onFocus={focus} onClick={click}>Save</button></Tooltip>);
    const button = screen.getByRole("button");
    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(focus).toHaveBeenCalledOnce();
    fireEvent.click(button);
    expect(click).toHaveBeenCalledOnce();
    fireEvent.blur(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("flips above the trigger and clamps against viewport edges", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("role") === "tooltip"
        ? { width: 200, height: 40 } as DOMRect
        : { left: window.innerWidth - 25, top: window.innerHeight - 25, bottom: window.innerHeight - 5, width: 20 } as DOMRect;
    });
    render(<Tooltip label="Save"><button>Save</button></Tooltip>);
    fireEvent.focus(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toHaveStyle({
      left: `${window.innerWidth - 208}px`, top: `${window.innerHeight - 73}px`,
    });
    fireEvent.resize(window);
    fireEvent.scroll(document);
    expect(screen.getByRole("tooltip")).toHaveStyle({ left: `${window.innerWidth - 208}px` });
  });
});
