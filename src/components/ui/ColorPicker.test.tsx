import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorPicker } from "./ColorPicker";

const options = [{ value: "red", label: "Kırmızı", color: "var(--app-color-red)" }];
afterEach(() => vi.unstubAllGlobals());

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

  it("previews drag and hue changes without applying, then applies explicitly", () => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    const change = vi.fn();
    render(<ColorPicker label="Renk" custom value="rgb(50, 102, 187)" options={options} onChange={change} />);
    const trigger = screen.getByRole("button", { name: "Renk" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Özel renk" }));
    expect(screen.getByLabelText("Hex renk")).toHaveValue("#3266bb");
    const sv = screen.getByRole("slider", { name: "Doygunluk ve parlaklık" });
    vi.spyOn(sv, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
    sv.setPointerCapture = vi.fn(); sv.hasPointerCapture = () => true;
    fireEvent.pointerDown(sv, { clientX: 80, clientY: 30, pointerId: 1 });
    fireEvent.pointerMove(sv, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.change(screen.getByRole("slider", { name: "Ton" }), { target: { value: "120" } });
    expect(screen.getByLabelText("Hex renk")).toHaveValue("#408040");
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Hex renk"), { target: { value: "#123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Uygula" }));
    expect(change).toHaveBeenCalledExactlyOnceWith("#123456");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });
  it("cancels drafts with Escape, cancel and outside clicks; validates hex and applies Enter", () => {
    const change = vi.fn();
    render(<ColorPicker label="Renk" custom value="#3266bb" options={options} onChange={change} />);
    const trigger = screen.getByRole("button", { name: "Renk" });
    fireEvent.click(trigger);
    const openCustom = () => fireEvent.click(screen.getByRole("button", { name: "Özel renk" }));
    openCustom();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Doygunluk ve parlaklık" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "Hex renk" })).toBeNull();
    expect(screen.getByRole("button", { name: "Kırmızı" })).toBeInTheDocument();
    openCustom();
    fireEvent.click(screen.getByRole("button", { name: "İptal" }));
    openCustom();
    fireEvent.pointerDown(document.body);
    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger); openCustom();
    const hex = screen.getByLabelText("Hex renk");
    fireEvent.change(hex, { target: { value: "oops" } });
    expect(hex).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Uygula" })).toBeDisabled();
    fireEvent.keyDown(hex, { key: "Enter" });
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(hex, { target: { value: "#abcdef" } });
    fireEvent.keyDown(hex, { key: "Enter" });
    expect(change).toHaveBeenCalledExactlyOnceWith("#abcdef");
  });
});
