import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMotionMode, useReducedMotion } from "./useReducedMotion";
import { useSettingsStore } from "@/stores/settingsStore";
import type { Settings } from "@/lib/types";

afterEach(() => { vi.unstubAllGlobals(); useSettingsStore.setState({ settings: null }); });

it("updates the hook and root on settings and system changes, including before loading", () => {
  let reduced = true;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener: (_: string, callback: () => void) => listeners.add(callback), removeEventListener: (_: string, callback: () => void) => listeners.delete(callback) }));
  useSettingsStore.setState({ settings: null });
  const hook = renderHook(() => { useMotionMode(); return useReducedMotion(); });
  expect(hook.result.current).toBe(true);
  expect(document.documentElement.dataset.reducedMotion).toBe("true");
  act(() => useSettingsStore.setState({ settings: { motion: "on" } as Settings }));
  expect(hook.result.current).toBe(false);
  expect(document.documentElement.dataset.reducedMotion).toBe("false");
  act(() => useSettingsStore.setState({ settings: { motion: "off" } as Settings }));
  expect(hook.result.current).toBe(true);
  act(() => { reduced = false; listeners.forEach((listener) => listener()); });
  expect(hook.result.current).toBe(true);
  act(() => useSettingsStore.setState({ settings: { motion: "system" } as Settings }));
  expect(hook.result.current).toBe(false);
  act(() => { reduced = true; listeners.forEach((listener) => listener()); });
  expect(hook.result.current).toBe(true);
  hook.unmount();
  expect(listeners.size).toBe(0);
});
