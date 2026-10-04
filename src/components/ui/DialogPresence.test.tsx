import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
import { DialogPresence } from "./DialogPresence";
import { ShortcutsModal } from "@/features/settings/ShortcutsModal";
import { useUiStore } from "@/stores/uiStore";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useUiStore.setState({ confirmDialog: null });
});

it("hides the closing snapshot immediately, restores focus and cancels the old timer on reopening", () => {
  vi.useFakeTimers();
  const resolve = vi.fn();
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  useUiStore.setState({ confirmDialog: { titleKey: "trash.emptyTitle", messageKey: "trash.emptyMessage", resolve } });
  const { container } = render(<ConfirmDialog />);
  const title = screen.getByRole("heading").textContent;
  fireEvent.click(screen.getByRole("button", { name: "İptal" }));
  expect(resolve).toHaveBeenCalledExactlyOnceWith(false);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
  const backdrop = container.querySelector(".htnote-dialog-backdrop")!;
  expect(backdrop).toHaveAttribute("inert");
  expect(backdrop).toHaveAttribute("aria-hidden", "true");
  expect(backdrop).toHaveAttribute("data-closing", "true");
  expect(backdrop.textContent).toContain(title);
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.keyDown(document, { key: "Tab" });
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(trigger).toHaveFocus();
  act(() => vi.advanceTimersByTime(100));
  act(() => useUiStore.setState({ confirmDialog: { titleKey: "settings.changeRootTitle", messageKey: "settings.changeRootWarning", resolve: vi.fn() } }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Depolama klasörü değiştirilsin mi?");
  expect(backdrop).not.toHaveAttribute("inert");
  act(() => vi.advanceTimersByTime(40));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  act(() => useUiStore.getState().closeConfirmDialog());
  act(() => vi.advanceTimersByTime(139));
  expect(container.querySelector(".htnote-dialog-backdrop")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(container.querySelector(".htnote-dialog-backdrop")).toBeNull();
  expect(trigger).toHaveFocus();
  trigger.remove();
});

it("removes window keyboard listeners at the start of closing", () => {
  vi.useFakeTimers();
  const close = vi.fn();
  const { rerender, container } = render(<DialogPresence><ShortcutsModal onClose={close} /></DialogPresence>);
  rerender(<DialogPresence>{null}</DialogPresence>);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(container.querySelector(".htnote-dialog-backdrop")).toHaveAttribute("inert");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
});

it("unmounts synchronously without a delay when reduced motion is preferred", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const { rerender, container } = render(<DialogPresence><ShortcutsModal onClose={vi.fn()} /></DialogPresence>);
  rerender(<DialogPresence>{null}</DialogPresence>);
  expect(container).toBeEmptyDOMElement();
});
