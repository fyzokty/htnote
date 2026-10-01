import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotePicker } from "@/components/ui/NotePicker";
import { useTreeStore } from "@/stores/treeStore";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const third = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  useTreeStore.setState({ tree: [
    { type: "note", id: first, title: "Aktif", relPath: "Aktif", isFavorite: false, tags: [], updatedAt: "" },
    { type: "note", id: second, title: "İstanbul", relPath: "Gezi/İstanbul", isFavorite: false, tags: [], updatedAt: "" },
    { type: "note", id: third, title: "İzmir", relPath: "Gezi/İzmir", isFavorite: false, tags: [], updatedAt: "" },
  ] });
});

describe("NotePicker", () => {
  it("filters Turkish titles and excludes the current note", () => {
    render(<NotePicker currentNoteId={first} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText("Aktif")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Not ara" }), { target: { value: "istanbul" } });
    expect(screen.getByText("İstanbul")).toBeInTheDocument();
    expect(screen.queryByText("İzmir")).not.toBeInTheDocument();
    expect(screen.getByText("Gezi")).toBeInTheDocument();
  });

  it("selects with arrows and Enter, and closes with Escape", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<NotePicker currentNoteId={first} onSelect={onSelect} onClose={onClose} />);
    const input = screen.getByRole("textbox", { name: "Not ara" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: third }));
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
