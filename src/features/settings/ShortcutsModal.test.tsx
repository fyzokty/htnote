import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShortcutsModal } from "@/features/settings/ShortcutsModal";
import { formatShortcut, listShortcuts } from "@/lib/shortcuts/registry";

describe("ShortcutsModal", () => {
  it("lists every registry entry and closes on Escape", () => {
    const onClose = vi.fn();
    const { container } = render(<ShortcutsModal onClose={onClose} />);
    for (const shortcut of listShortcuts()) {
      const row = container.querySelector(`[data-shortcut-id="${shortcut.id}"]`);
      expect(screen.getByRole("dialog")).toHaveClass("htnote-dialog-surface");
  expect(screen.getByRole("dialog").parentElement).toHaveClass("htnote-dialog-backdrop");
  expect(row).not.toBeNull();
      expect(row).toHaveTextContent(formatShortcut(shortcut.id));
    }
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
