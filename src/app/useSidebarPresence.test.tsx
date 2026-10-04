import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSidebarPresence } from "./useSidebarPresence";
import { SIDEBAR_CLOSE_MS, SIDEBAR_OPEN_MS } from "./sidebarPresenceState";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => motion.reduced }));
beforeEach(() => { motion.reduced = false; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe("sidebar presence lifecycle", () => {
  it("retains closing content and mounts a collapsed first frame before opening", () => {
    const { result, rerender } = renderHook(({ visible }) => useSidebarPresence(visible), { initialProps: { visible: true } });
    rerender({ visible: false });
    expect(result.current).toEqual({ state: "closing", mounted: true, expanded: false });
    act(() => vi.advanceTimersByTime(SIDEBAR_CLOSE_MS));
    expect(result.current.mounted).toBe(false);
    rerender({ visible: true });
    expect(result.current).toEqual({ state: "entering", mounted: true, expanded: false });
    act(() => vi.advanceTimersByTime(40));
    expect(result.current.state).toBe("opening");
    act(() => vi.advanceTimersByTime(SIDEBAR_OPEN_MS));
    expect(result.current.state).toBe("open");
  });
  it("cancels a closing deadline when reopened and cancels unpainted openings", () => {
    const { result, rerender } = renderHook(({ visible }) => useSidebarPresence(visible), { initialProps: { visible: true } });
    rerender({ visible: false });
    act(() => vi.advanceTimersByTime(80));
    rerender({ visible: true });
    act(() => vi.advanceTimersByTime(SIDEBAR_CLOSE_MS));
    expect(result.current.mounted).toBe(true);
    act(() => vi.advanceTimersByTime(SIDEBAR_OPEN_MS));
    expect(result.current.state).toBe("open");
    rerender({ visible: false });
    act(() => vi.advanceTimersByTime(SIDEBAR_CLOSE_MS));
    rerender({ visible: true });
    rerender({ visible: false });
    act(() => vi.advanceTimersByTime(40));
    expect(result.current.state).toBe("closed");
  });
  it("settles immediately when reduced motion is enabled during closing", () => {
    const { result, rerender } = renderHook(({ visible }) => useSidebarPresence(visible), { initialProps: { visible: true } });
    rerender({ visible: false });
    motion.reduced = true;
    rerender({ visible: false });
    expect(result.current.state).toBe("closed");
    rerender({ visible: true });
    expect(result.current.state).toBe("open");
    expect(vi.getTimerCount()).toBe(0);
  });
});
