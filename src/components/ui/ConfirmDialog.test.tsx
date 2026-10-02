import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";
import { useUiStore } from "@/stores/uiStore";

beforeEach(() => useUiStore.setState({ confirmDialog: null }));

it("styles cancel and destructive confirmation and preserves focus trapping", () => {
  const resolve = vi.fn();
  useUiStore.setState({ confirmDialog: { titleKey: "trash.emptyTitle", messageKey: "trash.emptyMessage", resolve } });
  render(<ConfirmDialog />);
  const cancel = screen.getByRole("button", { name: "İptal" });
  const confirm = screen.getByRole("button", { name: "Sil" });
  expect(cancel).toHaveClass("htnote-button-secondary");
  expect(confirm).toHaveClass("htnote-button-danger");
  expect(cancel).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(confirm).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(cancel).toHaveFocus();
  fireEvent.click(confirm);
  expect(resolve).toHaveBeenCalledWith(true);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});


it("uses a primary action for non-destructive confirmations", () => {
  void useUiStore.getState().confirm("settings.changeRootTitle", "settings.changeRootWarning", { path: "notes" }, { variant: "primary", labelKey: "ui.confirm" });
  render(<ConfirmDialog />);
  expect(screen.getByRole("button", { name: "Onayla" })).toHaveClass("htnote-button-primary");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
