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
