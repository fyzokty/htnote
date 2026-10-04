import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hideSplash } from "@/lib/splash";

describe("hideSplash", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  });
  afterEach(() => {
    document.getElementById("htnote-splash")?.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  function addSplash() {
    const splash = document.createElement("div");
    splash.id = "htnote-splash";
    document.body.append(splash);
    return splash;
  }
  it("does nothing when absent", () => {
    expect(() => hideSplash()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("hides then removes at the fallback deadline", () => {
    const splash = addSplash();
    hideSplash();
    expect(splash.dataset.state).toBe("hidden");
    vi.advanceTimersByTime(399);
    expect(splash.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(splash.isConnected).toBe(false);
  });
  it("removes on its opacity transition and clears the fallback", () => {
    const splash = addSplash();
    hideSplash();
    const event = new Event("transitionend");
    Object.defineProperty(event, "propertyName", { value: "opacity" });
    splash.dispatchEvent(event);
    expect(splash.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("removes immediately with reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const splash = addSplash();
    hideSplash();
    expect(splash.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("is safe to call twice during and after hiding", () => {
    const splash = addSplash();
    hideSplash();
    hideSplash();
    expect(vi.getTimerCount()).toBe(1);
    vi.runAllTimers();
    hideSplash();
    expect(splash.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
