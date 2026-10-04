import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TagInput } from "@/features/tags/TagInput";

describe("TagInput", () => {
  it("shows every compact tag until measured layout requests folding", () => {
    render(<TagInput compact tags={["one", "two"]} suggestions={[]} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /one etiketini/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /two etiketini/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /diğer etiket/ })).not.toBeInTheDocument();
  });
  it("folds overflowing tags into an accessible removal menu", () => {
    const onChange = vi.fn();
    render(<TagInput compact visibleTagCount={0} tags={["one", "two", "three"]} suggestions={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "3 di\u011fer etiket" }));
    fireEvent.click(screen.getByRole("button", { name: /two etiketini/ }));
    expect(onChange).toHaveBeenCalledWith(["one", "three"]);
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "+ etiket");
  });

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
