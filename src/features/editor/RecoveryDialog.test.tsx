import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { RecoveryDialog } from "@/features/editor/RecoveryDialog";

it("shows draft time and disk warning, and routes recover and ignore", () => {
  const onRecover = vi.fn();
  const onIgnore = vi.fn();
  render(<RecoveryDialog candidates={[{
    draft: { id: "a", html: "new", css: "", js: "", baseHash: "old", savedAt: "2026-10-01T00:00:00Z" },
    note: { type: "note", id: "a", title: "Başlık", relPath: "Başlık", isFavorite: false, tags: [], updatedAt: "2026-09-30T00:00:00Z" },
    diskChanged: true,
  }]} onRecover={onRecover} onIgnore={onIgnore} />);
  expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  expect(screen.getByText("Başlık")).toBeInTheDocument();
  expect(screen.getByText(/diskte değişti/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Kurtar" })).toHaveClass("htnote-button-primary");
  expect(screen.getByRole("button", { name: "Yok say" })).toHaveClass("htnote-button-danger");
  fireEvent.click(screen.getByRole("button", { name: "Kurtar" }));
  fireEvent.click(screen.getByRole("button", { name: "Yok say" }));
  expect(onRecover).toHaveBeenCalledWith("a");
  expect(onIgnore).toHaveBeenCalledWith("a");
});
