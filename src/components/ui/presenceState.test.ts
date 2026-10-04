import { describe, expect, it } from "vitest";
import { nextPresence } from "./presenceState";

describe("popover presence", () => {
  it("opens, retains closing content, and reopens with the latest content", () => {
    const open = nextPresence({ content: null, open: false }, "first", false);
    expect(open).toEqual({ content: "first", open: true });
    const closing = nextPresence(open, null, false);
    expect(closing).toEqual({ content: "first", open: false });
    expect(nextPresence(closing, "second", false)).toEqual({ content: "second", open: true });
  });
  it("removes immediately with reduced motion", () => {
    expect(nextPresence({ content: "first", open: true }, null, true)).toEqual({ content: null, open: false });
  });
});
