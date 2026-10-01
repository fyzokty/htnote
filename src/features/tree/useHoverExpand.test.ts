import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useHoverExpand } from "@/features/tree/useHoverExpand";

afterEach(() => vi.useRealTimers());

it("opens a closed folder after 700 ms", () => {
  vi.useFakeTimers();
  const toggle = vi.fn();
  const { result } = renderHook(() => useHoverExpand(toggle));
  act(() => result.current.hover("a", true));
  act(() => vi.advanceTimersByTime(699));
  expect(toggle).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(toggle).toHaveBeenCalledWith("a");
});

it("cancels on target change, drop, and unmount", () => {
  vi.useFakeTimers();
  const toggle = vi.fn();
  const { result, unmount } = renderHook(() => useHoverExpand(toggle));
  act(() => { result.current.hover("a", true); result.current.hover("b", false); });
  act(() => vi.advanceTimersByTime(700));
  expect(toggle).not.toHaveBeenCalled();
  act(() => { result.current.hover("a", true); result.current.clear(); });
  act(() => vi.advanceTimersByTime(700));
  expect(toggle).not.toHaveBeenCalled();
  act(() => result.current.hover("a", true));
  unmount();
  act(() => vi.advanceTimersByTime(700));
  expect(toggle).not.toHaveBeenCalled();
});

it("rechecks whether the folder is still closed when the timer expires", () => {
  vi.useFakeTimers();
  const toggle = vi.fn();
  const stillClosed = vi.fn(() => false);
  const { result } = renderHook(() => useHoverExpand(toggle));
  act(() => result.current.hover("a", true, stillClosed));
  act(() => vi.advanceTimersByTime(700));
  expect(stillClosed).toHaveBeenCalledOnce();
  expect(toggle).not.toHaveBeenCalled();
});
