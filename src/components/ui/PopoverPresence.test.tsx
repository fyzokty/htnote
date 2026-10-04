import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Settings } from "@/lib/types";
import { createVisualExtensions } from "@/features/editor/extensions";
import { FontFamilySelector, FontSizeSelector } from "@/features/editor/FontSelectors";
import { ContextMenu } from "./ContextMenu";
import { ColorPicker } from "./ColorPicker";
import { PopoverPresence } from "./PopoverPresence";

let settings: Settings | null;
beforeEach(() => { settings = useSettingsStore.getState().settings; useSettingsStore.setState({ settings: { motion: "on" } as Settings }); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); useSettingsStore.setState({ settings }); });

describe("animated popovers", () => {
  it("retains a ContextMenu while closing and cancels its removal on reopen", () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return <><button onClick={() => setOpen(true)}>Open</button><PopoverPresence>{open && <ContextMenu x={0} y={0} trigger={null} items={[]} onClose={() => setOpen(false)} />}</PopoverPresence></>;
    }
    render(<Harness />);
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(menu).toHaveAttribute("data-closing", "true");
    fireEvent.click(screen.getByRole("button"));
    act(() => vi.advanceTimersByTime(120));
    expect(menu).toHaveAttribute("data-closing", "false");
    fireEvent.pointerDown(document.body);
    act(() => vi.advanceTimersByTime(120));
    expect(menu).not.toBeInTheDocument();
  });
  it("retains ColorPicker and custom color surfaces until their closing animation ends", () => {
    render(<ColorPicker label="Color" value="#123456" options={[]} custom onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Color" });
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Özel renk" }));
    const custom = document.querySelector(".htnote-custom-color")!;
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(custom).toHaveAttribute("data-closing", "true");
    expect(screen.getByRole("button", { name: "Varsayılan (renk yok)" })).toHaveFocus();
    act(() => vi.advanceTimersByTime(120));
    expect(custom).not.toBeInTheDocument();
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(panel).toHaveAttribute("data-closing", "true");
    act(() => vi.advanceTimersByTime(120));
    expect(panel).not.toBeInTheDocument();
  });
  it.each(["family", "size"])("retains the font %s list through closing", (kind) => {
    const editor = new Editor({ extensions: createVisualExtensions(""), content: "<p>Text</p>" });
    try {
      const view = render(kind === "family" ? <FontFamilySelector editor={editor} /> : <FontSizeSelector editor={editor} />);
      fireEvent.click(screen.getByTestId(kind === "family" ? "editor-font-family" : "editor-font-size-options"));
      const panel = screen.getByRole("dialog");
      fireEvent.keyDown(panel, { key: "Escape" });
      expect(panel).toHaveAttribute("data-closing", "true");
      expect(panel).toHaveAttribute("inert");
      act(() => vi.advanceTimersByTime(120));
      expect(panel).not.toBeInTheDocument();
      view.unmount();
    } finally { editor.destroy(); }
  });
});
