import { describe, expect, it } from "vitest";
import { nextSidebarPresence as next } from "./sidebarPresenceState";

describe("sidebar presence", () => {
  it("mounts collapsed, opens, closes and finally unmounts", () => {
    expect(next("closed", "show", false)).toBe("entering");
    expect(next("entering", "start", false)).toBe("opening");
    expect(next("opening", "finish", false)).toBe("open");
    expect(next("open", "hide", false)).toBe("closing");
    expect(next("closing", "finish", false)).toBe("closed");
  });
  it("reverses rapid toggles and ignores stale starts", () => {
    expect(next("closing", "show", false)).toBe("opening");
    expect(next("opening", "hide", false)).toBe("closing");
    expect(next("entering", "hide", false)).toBe("closed");
    expect(next("closed", "start", false)).toBe("closed");
    expect(next("open", "show", false)).toBe("open");
  });
  it("resolves every intermediate state immediately with reduced motion", () => {
    for (const state of ["closed", "entering", "opening", "open", "closing"] as const) {
      expect(next(state, "show", true)).toBe("open");
      expect(next(state, "hide", true)).toBe("closed");
    }
  });
});
