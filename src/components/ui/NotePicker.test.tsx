import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("waits for real results and selects the clicked note after a delayed tree load", () => {
    const tree = useTreeStore.getState().tree;
    useTreeStore.setState({ tree: [] });
    const onSelect = vi.fn();
    render(<NotePicker currentNoteId={first} onSelect={onSelect} onClose={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("option")).toBeNull();
    act(() => { useTreeStore.setState({ tree }); });
    fireEvent.click(screen.getByRole("option", { name: "İzmir" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: third }));
  });

  it("retains the active note through a tree reorder and handles a removed result", () => {
    const tree = useTreeStore.getState().tree;
    const onSelect = vi.fn();
    render(<NotePicker currentNoteId={first} onSelect={onSelect} onClose={vi.fn()} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    act(() => { useTreeStore.setState({ tree: [tree[0], tree[2], tree[1]] }); });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: third }));
    act(() => { useTreeStore.setState({ tree: [tree[0], tree[1]] }); });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: second }));
  });

  it("activates the focused option with Enter instead of the hovered option", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NotePicker currentNoteId={first} onSelect={onSelect} onClose={vi.fn()} />);
    await user.hover(screen.getByRole("option", { name: "İzmir" }));
    screen.getByRole("option", { name: "İstanbul" }).focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: second }));
  });

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
