import { afterEach, describe, expect, it, vi } from "vitest";
import { measureHeaderActions } from "./useHeaderLayout";
import { fitNoteHeader } from "./headerLayout";

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe("measureHeaderActions", () => {
  it("measures natural actions independently of a previously compacted flex box", () => {
    const header = document.createElement("div");
    header.dataset.compactLevel = "3";
    header.innerHTML = '<div data-header-actions><button style="column-gap:6px"><span data-action-text data-action-priority="1">Export</span></button></div>';
    document.body.appendChild(header);
    const actions = header.firstElementChild as HTMLElement;
    // A constrained compact group plus a hidden label is not an additive
    // measurement of its natural box (273 + 90 + 6 would reserve 369px).
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const width = this.hasAttribute("data-action-text") ? 90
        : this.hasAttribute("data-header-actions") ? 273 : 341;
      return { width } as DOMRect;
    });
    const measured = measureHeaderActions(actions);
    expect(measured).toEqual({ width: 341, savings: [96, 0, 0, 0, 0] });
    const content = { available: 1282, title: 355, path: 100, saved: 177.1875,
      tags: [99.2, 87.5375], add: 80, overflow: 32 };
    expect(fitNoteHeader({ ...content, actions: 273 + 96 }).saved).toBe(0);
    expect(fitNoteHeader({ ...content, actions: measured.width }).saved).toBe(content.saved);
    expect(header.children).toHaveLength(1);
    expect(actions.querySelector<HTMLElement>("[data-action-text]")!.style.position).toBe("");
  });

  it("removes the inert measurement clone if measurement fails", () => {
    const header = document.createElement("div");
    const actions = document.createElement("div");
    header.appendChild(actions);
    document.body.appendChild(header);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => { throw new Error("measurement failed"); });
    expect(() => measureHeaderActions(actions)).toThrow("measurement failed");
    expect(header.children).toHaveLength(1);
  });
});
