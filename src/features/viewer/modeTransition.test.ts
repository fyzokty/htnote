import { it, expect } from "vitest";
import { modeTransition } from "./modeTransition";
it("uses only opacity for reading and slides editor entries", () => {
  expect(modeTransition("visual", "view")).toBe("fade");
  expect(modeTransition("code", "view")).toBe("fade");
  expect(modeTransition("view", "visual")).toBe("slide");
  expect(modeTransition("visual", "code")).toBe("slide");
  expect(modeTransition("code", "visual")).toBe("slide");
  expect(modeTransition("view", "view")).toBe("none");
});
