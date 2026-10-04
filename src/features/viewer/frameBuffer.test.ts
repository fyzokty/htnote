import { describe, it, expect } from "vitest";
import { requestRevision, revealRevision } from "./frameBuffer";
describe("frame buffer", () => {
  it("retains the loaded revision until its replacement is ready", () => {
    const state = requestRevision({ visible: "a", pending: null }, "b");
    expect(state).toEqual({ visible: "a", pending: "b" });
    expect(revealRevision(state, "b")).toEqual({ visible: "b", pending: null });
  });
  it("discards intermediate revisions and their late load callbacks", () => {
    const state = requestRevision(requestRevision({ visible: "a", pending: null }, "b"), "c");
    expect(revealRevision(state, "b")).toBe(state);
    expect(revealRevision(state, "c")).toEqual({ visible: "c", pending: null });
    expect(requestRevision(state, "a")).toEqual({ visible: "a", pending: null });
  });
});
