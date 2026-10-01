import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { MoveDialog } from "@/features/tree/MoveDialog";
import type { TreeNode } from "@/lib/types";

const child: TreeNode = { type: "folder", name: "Child", relPath: "a/child", children: [] };
const source: TreeNode = { type: "folder", name: "A", relPath: "a", children: [child] };
const destination: TreeNode = { type: "folder", name: "B", relPath: "b", children: [] };

it("disables invalid folders and moves to a keyboard-selected destination", () => {
  const move = vi.fn();
  render(<MoveDialog source={source} tree={[source, destination]} onMove={move} onClose={vi.fn()} />);
  expect(screen.getByRole("option", { name: "A" })).toBeDisabled();
  expect(screen.getByRole("option", { name: "Child" })).toBeDisabled();
  const listbox = screen.getByRole("listbox");
  expect(listbox).toHaveFocus();
  fireEvent.keyDown(listbox, { key: "ArrowDown" });
  expect(listbox).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "B" }).id);
  fireEvent.keyDown(listbox, { key: "Enter" });
  expect(move).toHaveBeenCalledWith("b");
});

it("wraps between enabled options and keeps focus on the listbox", () => {
  render(<MoveDialog source={child} tree={[source, destination]} onMove={vi.fn()} onClose={vi.fn()} />);
  const listbox = screen.getByRole("listbox");
  fireEvent.keyDown(listbox, { key: "ArrowUp" });
  expect(listbox).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "B" }).id);
  fireEvent.keyDown(listbox, { key: "ArrowDown" });
  expect(listbox).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "Kök" }).id);
  expect(listbox).toHaveFocus();
});

it("closes on Escape", () => {
  const close = vi.fn();
  render(<MoveDialog source={source} tree={[source]} onMove={vi.fn()} onClose={close} />);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});
