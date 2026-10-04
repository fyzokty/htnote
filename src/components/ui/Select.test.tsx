import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Settings } from "@/lib/types";
import { Select } from "./Select";

const options = [{ value: "p", label: "Paragraph" }, { value: "x", label: "Disabled", disabled: true }, { value: "h", label: "Heading" }, { value: "q", label: "Quote" }];
let settings: Settings | null;
beforeEach(() => { settings = useSettingsStore.getState().settings; useSettingsStore.setState({ settings: { motion: "on" } as Settings }); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); useSettingsStore.setState({ settings }); });

describe("Select", () => {
  it("navigates arrows, Home/End and typeahead, chooses with Enter, and returns focus", () => {
    const change = vi.fn();
    render(<Select value="p" options={options} onChange={change} aria-label="Block" />);
    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const list = screen.getByRole("listbox");
    expect(list).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Heading" }).id).toBe(list.getAttribute("aria-activedescendant"));
    fireEvent.keyDown(list, { key: "End" });
    expect(screen.getByRole("option", { name: "Quote" }).id).toBe(list.getAttribute("aria-activedescendant"));
    fireEvent.keyDown(list, { key: "Home" });
    fireEvent.keyDown(list, { key: "ArrowUp" });
    expect(screen.getByRole("option", { name: "Quote" }).id).toBe(list.getAttribute("aria-activedescendant"));
    fireEvent.keyDown(list, { key: "h" });
    fireEvent.keyDown(list, { key: "e" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(change).toHaveBeenCalledExactlyOnceWith("h");
    expect(trigger).toHaveFocus();
    expect(list).toHaveAttribute("data-closing", "true");
    expect(list).toHaveAttribute("inert");
    act(() => vi.advanceTimersByTime(120));
    expect(list).not.toBeInTheDocument();
  });
  it("reopens during closing, handles Escape/outside clicks and removes immediately when motion is off", () => {
    render(<Select value="p" options={options} onChange={vi.fn()} aria-label="Block" />);
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);
    const list = screen.getByRole("listbox");
    fireEvent.keyDown(list, { key: "Escape" });
    act(() => vi.advanceTimersByTime(60));
    fireEvent.click(trigger);
    expect(list).toHaveAttribute("data-closing", "false");
    act(() => vi.advanceTimersByTime(120));
    expect(list).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(list).toHaveAttribute("data-closing", "true");
    act(() => useSettingsStore.setState({ settings: { motion: "off" } as Settings }));
    expect(list).not.toBeInTheDocument();
  });
});
