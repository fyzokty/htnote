import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "./SegmentedControl";

const options = [
  { value: "first", label: "First" },
  { value: "second", label: "Second", disabled: true, tooltip: "Unavailable" },
  { value: "third", label: "Third" },
] as const;

describe("SegmentedControl", () => {
  it("reflects the controlled selection and skips disabled options with arrows, Home and End", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SegmentedControl label="Mode" value="first" options={options} onChange={onChange} />);
    const first = screen.getByRole("button", { name: "First" });
    const second = screen.getByRole("button", { name: "Second" });
    const third = screen.getByRole("button", { name: "Third" });
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toBeDisabled();
    fireEvent.click(second);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(third).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("third");
    rerender(<SegmentedControl label="Mode" value="third" options={options} onChange={onChange} />);
    expect(third).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveAttribute("aria-pressed", "false");
    fireEvent.keyDown(third, { key: "ArrowRight" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(third).toHaveFocus();
    fireEvent.keyDown(third, { key: "Home" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "End" });
    expect(third).toHaveFocus();
  });
});

it("measures the selected button and enables transitions only after the first placement", () => {
  const left = vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function(this: HTMLElement) { return this.getAttribute("aria-label") === "Third" ? 104 : 2; });
  const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function(this: HTMLElement) { return this.getAttribute("aria-label") === "Third" ? 72 : 48; });
  try {
    const { container, rerender } = render(<SegmentedControl label="Mode" value="first" options={options} onChange={vi.fn()} />);
    const pill = container.querySelector<HTMLElement>(".htnote-segment-indicator")!;
    expect(pill.style.transform).toBe("translateX(2px)");
    expect(pill.style.width).toBe("48px");
    expect(pill.style.transition).toBe("none");
    rerender(<SegmentedControl label="Mode" value="third" options={options} onChange={vi.fn()} />);
    expect(pill.style.transform).toBe("translateX(104px)");
    expect(pill.style.width).toBe("72px");
    expect(pill.style.transition).toContain("200ms");
  } finally { left.mockRestore(); width.mockRestore(); }
});
