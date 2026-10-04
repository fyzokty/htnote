import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ContextMenu } from "@/components/ui/ContextMenu";

describe("ContextMenu", () => {
  it("shows the shortcut as a keyboard hint beside the item label", () => {
    render(<ContextMenu x={0} y={0} trigger={null} onClose={vi.fn()} items={[
      { id: "close", label: "Kapat", shortcut: "Ctrl+W", onSelect: vi.fn() },
    ]} />);
    const item = screen.getByRole("menuitem", { name: "KapatCtrl+W" });
    expect(item.querySelector("kbd")).toHaveTextContent("Ctrl+W");
  });

  it("skips disabled items and activates the focused item", () => {
    const select = vi.fn();
    const close = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    render(<ContextMenu x={0} y={0} trigger={trigger} onClose={close} items={[
      { id: "one", label: "One", onSelect: vi.fn() },
      { id: "off", label: "Off", disabled: true, onSelect: vi.fn() },
      { id: "two", label: "Two", onSelect: select },
    ]} />);
    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "One" }), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Two" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Two" }), { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "One" }), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Two" }), { key: " " });
    expect(select).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    trigger.remove();
  });

  it("closes with Escape or outside pointer", () => {
    const close = vi.fn();
    const view = render(<ContextMenu x={0} y={0} trigger={null} onClose={close} items={[{ id: "one", label: "One", onSelect: vi.fn() }]} />);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
    fireEvent.pointerDown(document.body);
    expect(close).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});
