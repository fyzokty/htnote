import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FavoritesSection } from "@/features/favorites/FavoritesSection";
import type { TreeNode } from "@/lib/types";
import { resetTreeStoreForTests, useTreeStore } from "@/stores/treeStore";

const favoriteNote: TreeNode = {
  type: "note",
  id: "fav-1",
  title: "Favori Not",
  relPath: "Favori Not",
  isFavorite: true,
  tags: [],
  updatedAt: "",
};

beforeEach(() => {
  resetTreeStoreForTests();
  localStorage.clear();
});

describe("FavoritesSection", () => {
  it("renders nothing when there are no favorite notes", () => {
    useTreeStore.setState({ tree: [{ type: "folder", name: "A", relPath: "A", children: [] }] });
    const { container } = render(<FavoritesSection onOpenNote={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("toggles section expansion, chevron rotation, and aria-expanded", () => {
    useTreeStore.setState({ tree: [favoriteNote] });
    render(<FavoritesSection onOpenNote={vi.fn()} />);

    const toggleButton = screen.getByRole("button", { name: /Favoriler/i });
    expect(toggleButton).toHaveAttribute("aria-expanded", "true");

    const chevron = toggleButton.querySelector("svg");
    expect(chevron).toHaveAttribute("data-state", "open");
    expect(chevron).toHaveClass("rotate-90");
    expect(screen.getByRole("button", { name: "Favori Not" })).toBeInTheDocument();

    // Collapse
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    expect(chevron).toHaveAttribute("data-state", "closed");
    expect(chevron).toHaveClass("rotate-0");
    expect(chevron).not.toHaveClass("rotate-90");
    expect(screen.queryByRole("button", { name: "Favori Not" })).toBeNull();
  });
});
