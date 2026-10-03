import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InlineRename } from "@/features/tree/InlineRename";

describe("InlineRename", () => {
  it("selects the name and confirms on Enter", () => {
    const confirm = vi.fn();
    render(<InlineRename name="Old" label="Rename" onConfirm={confirm} onCancel={vi.fn()} />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveFocus();
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    fireEvent.change(input, { target: { value: "  New  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(confirm).toHaveBeenCalledWith("New");
  });

  it("cancels on Escape and rejects empty or unchanged names", () => {
    const cancel = vi.fn();
    const confirm = vi.fn();
    const view = render(<InlineRename name="Old" label="Rename" onConfirm={confirm} onCancel={cancel} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(cancel).toHaveBeenCalledOnce();
    view.unmount();
    render(<InlineRename name="Old" label="Rename" onConfirm={confirm} onCancel={cancel} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("confirms on blur", () => {
    const confirm = vi.fn();
    render(<InlineRename name="Old" label="Rename" onConfirm={confirm} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Changed" } });
    fireEvent.blur(screen.getByRole("textbox"));
    expect(confirm).toHaveBeenCalledWith("Changed");
  });

  it("supports underline variant without background", () => {
    const confirm = vi.fn();
    render(<InlineRename name="Heading" label="Rename title" variant="underline" onConfirm={confirm} onCancel={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Rename title" });
    expect(input).toHaveClass("bg-transparent", "border-b-2", "border-app-accent");
    fireEvent.change(input, { target: { value: "Updated Heading" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(confirm).toHaveBeenCalledWith("Updated Heading");
  });
});
