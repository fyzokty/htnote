import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { useUiStore } from "@/stores/uiStore";

beforeEach(() => useUiStore.setState({ unsavedDialog: null }));

it("handles actions, Escape and focus trapping", () => {
  const trigger = document.createElement("button");
  document.body.appendChild(trigger);
  trigger.focus();
  const resolve = vi.fn(() => useUiStore.getState().closeUnsavedDialog());
  useUiStore.getState().openUnsavedDialog(["a", "b"], resolve);
  const { unmount } = render(<UnsavedChangesDialog />);
  const dialog = screen.getByRole("dialog");
  expect(screen.getByRole("dialog")).toHaveClass("htnote-dialog-surface");
  expect(screen.getByRole("dialog").parentElement).toHaveClass("htnote-dialog-backdrop");
  expect(dialog).toHaveAttribute("aria-modal", "true");
  const cancel = screen.getByRole("button", { name: "İptal" });
  expect(cancel).toHaveClass("htnote-button-secondary");
  expect(screen.getByTestId("discard-changes")).toHaveClass("htnote-button-danger");
  expect(screen.getByTestId("save-changes")).toHaveClass("htnote-button-primary");
  expect(cancel).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(screen.getByRole("button", { name: "Tümünü kaydet" })).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(resolve).toHaveBeenCalledWith("cancel");
  expect(trigger).toHaveFocus();
  unmount();
  trigger.remove();
});

it("maps save and discard buttons to their decisions", () => {
  const resolve = vi.fn(() => useUiStore.getState().closeUnsavedDialog());
  act(() => useUiStore.getState().openUnsavedDialog(["a"], resolve));
  render(<UnsavedChangesDialog />);
  fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(resolve).toHaveBeenCalledWith("save");
  act(() => useUiStore.getState().openUnsavedDialog(["a"], resolve));
  fireEvent.click(screen.getByRole("button", { name: "Kaydetme" }));
  expect(resolve).toHaveBeenLastCalledWith("discard");
});
