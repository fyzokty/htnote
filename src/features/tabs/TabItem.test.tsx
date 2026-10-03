import { fireEvent, render, screen } from "@testing-library/react";
import { useSortable } from "@dnd-kit/sortable";
import { describe, expect, it, vi } from "vitest";

import { TabItem } from "./TabItem";

vi.mock("@dnd-kit/sortable", () => ({ useSortable: vi.fn() }));

describe("TabItem dragging", () => {
  it("stays above siblings and on the horizontal axis regardless of the pointer height", () => {
    vi.mocked(useSortable).mockReturnValue({
      attributes: {}, listeners: {}, setNodeRef: vi.fn(),
      transform: { x: -80, y: 200, scaleX: 1, scaleY: 1 },
      transition: undefined, isDragging: true,
    } as unknown as ReturnType<typeof useSortable>);
    const onClose = vi.fn();
    const view = render(<TabItem noteId="special:settings" special="settings" active
      onActivate={vi.fn()} onClose={onClose} onContextMenu={vi.fn()} />);
    const tab = screen.getByRole("tab", { name: "Ayarlar" });
    expect(tab).toHaveStyle({ transform: "translate3d(-80px, 0px, 0)", zIndex: 10 });
    expect(tab.style.boxShadow).toContain("var(--app-shadow)");
    expect(tab).toHaveAttribute("data-dragging", "true");
    fireEvent.click(screen.getByRole("button", { name: "Ayarlar sekmesini kapat" }));
    expect(onClose).toHaveBeenCalledOnce();
    vi.mocked(useSortable).mockReturnValue({
      attributes: {}, listeners: {}, setNodeRef: vi.fn(),
      transform: { x: 80, y: -200, scaleX: 1, scaleY: 1 },
      transition: "transform 150ms ease-out", isDragging: false,
    } as unknown as ReturnType<typeof useSortable>);
    view.rerender(<TabItem noteId="special:settings" special="settings" active
      onActivate={vi.fn()} onClose={onClose} onContextMenu={vi.fn()} />);
    expect(tab).toHaveStyle({ transform: "translate3d(80px, 0px, 0)", zIndex: 0, transition: "transform 150ms ease-out" });
    expect(tab.style.boxShadow).toBe("");
  });
});
