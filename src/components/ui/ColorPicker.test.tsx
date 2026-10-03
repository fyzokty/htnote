import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorPicker } from "./ColorPicker";

const options = [{ value: "red", label: "Kırmızı", color: "var(--app-color-red)" }];

describe("ColorPicker", () => {
  it("opens a palette, selects a color and restores focus", () => {
    const change = vi.fn();
    render(<ColorPicker label="Renk" value="red" options={options} onChange={change} />);
    const trigger = screen.getByRole("button", { name: "Renk" });
    fireEvent.click(trigger);
    const red = screen.getByRole("button", { name: "Kırmızı" });
    expect(red).toHaveAttribute("aria-pressed", "true");
    expect(red).toHaveFocus();
    fireEvent.keyDown(red, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Varsayılan (renk yok)" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Varsayılan (renk yok)" }));
    expect(change).toHaveBeenCalledWith("");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("handles custom colors, Escape and outside dismissal", () => {
    const change = vi.fn();
    render(<ColorPicker label="Renk" custom value="rgb(50, 102, 187)" options={options} onChange={change} />);
    const trigger = screen.getByRole("button", { name: "Renk" });
    fireEvent.click(trigger);
    expect(screen.getByLabelText("Özel renk")).toHaveValue("#3266bb");
    fireEvent.change(screen.getByLabelText("Özel renk"), { target: { value: "#123456" } });
    expect(change).toHaveBeenCalledWith("#123456");
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
