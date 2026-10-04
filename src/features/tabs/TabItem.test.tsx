import { fireEvent, render, screen } from "@testing-library/react";
import { useSortable } from "@dnd-kit/sortable";
import { describe, expect, it, vi } from "vitest";

import { TabItem } from "./TabItem";

vi.mock("@dnd-kit/sortable", () => ({ useSortable: vi.fn() }));

describe("TabItem", () => {
  it("triggers onClose when clicking the close button", () => {
    vi.mocked(useSortable).mockReturnValue({
      attributes: {}, listeners: {}, setNodeRef: vi.fn(),
      transform: null, transition: undefined, isDragging: false,
    } as unknown as ReturnType<typeof useSortable>);
    const onClose = vi.fn();
    render(<TabItem noteId="special:settings" special="settings" active
      onActivate={vi.fn()} onClose={onClose} onContextMenu={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ayarlar sekmesini kapat" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
