import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TagInput } from "@/features/tags/TagInput";

describe("TagInput", () => {
  it("adds with Enter and comma and prevents duplicates", () => {
    const onChange = vi.fn();
    const { rerender } = render(<TagInput tags={[]} suggestions={[]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "İstanbul" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["İstanbul"]);
    rerender(<TagInput tags={["İstanbul"]} suggestions={[]} onChange={onChange} />);
    fireEvent.change(input, { target: { value: "istanbul" } });
    fireEvent.keyDown(input, { key: "," });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: "Ankara" } });
    fireEvent.keyDown(input, { key: "," });
    expect(onChange).toHaveBeenLastCalledWith(["İstanbul", "Ankara"]);
  });

  it("removes the last chip with Backspace and supports chip removal", () => {
    const onChange = vi.fn();
    render(<TagInput tags={["one", "two"]} suggestions={[]} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith(["one"]);
    fireEvent.click(screen.getByRole("button", { name: /one etiketini kaldır/ }));
    expect(onChange).toHaveBeenLastCalledWith(["two"]);
  });

  it("shows usage-sorted suggestions and selects one with keyboard", () => {
    const onChange = vi.fn();
    render(<TagInput tags={[]} suggestions={[{ tag: "İstanbul", count: 3 }, { tag: "İzmir", count: 1 }]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "i" } });
    expect(screen.getAllByRole("option").map((item) => item.textContent)).toEqual(["İstanbul3", "İzmir1"]);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["İzmir"]);
  });
});
