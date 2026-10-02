import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";
import { IconButton } from "./IconButton";

describe("Button", () => {
  it.each(["primary", "secondary", "ghost", "danger"] as const)("renders the %s variant with native semantics", (variant) => {
    const click = vi.fn();
    render(<Button variant={variant} size="sm" onClick={click}><svg aria-hidden />Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass(`htnote-button-${variant}`, "htnote-button-sm", "select-none");
    fireEvent.click(button);
    expect(click).toHaveBeenCalledOnce();
  });

  it("supports a ref, submit type, attributes and disabled state", () => {
    const ref = createRef<HTMLButtonElement>();
    const click = vi.fn();
    render(<Button ref={ref} type="submit" disabled aria-pressed="true" onClick={click}>Save</Button>);
    expect(ref.current).toBe(screen.getByRole("button"));
    expect(ref.current).toHaveAttribute("type", "submit");
    expect(ref.current).toHaveClass("htnote-button-secondary", "htnote-button-md");
    expect(ref.current).toBeDisabled();
    fireEvent.click(ref.current!);
    expect(click).not.toHaveBeenCalled();
  });
});

it("IconButton supplies a label and keyboard tooltip without a native title", () => {
  render(<IconButton label="Save" shortcut="Ctrl+S"><svg aria-hidden /></IconButton>);
  const button = screen.getByRole("button", { name: "Save" });
  expect(button).toHaveClass("htnote-icon-button", "htnote-button-ghost");
  expect(button).not.toHaveAttribute("title");
  fireEvent.focus(button);
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).toHaveTextContent("SaveCtrl+S");
  expect(button).toHaveAttribute("aria-describedby", tooltip.id);
  fireEvent.keyDown(button, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
