import { expect, it } from "vitest";
import { dialogCloseDuration, nextDialogPresence } from "./dialogPresenceState";

it("retains the last snapshot while closing and immediately replaces it on reopening", () => {
  const first = { title: "first" };
  const opened = nextDialogPresence({ open: false, content: null }, first, false);
  const closing = nextDialogPresence(opened, null, false);
  expect(closing).toEqual({ open: false, content: first });
  const second = { title: "second" };
  expect(nextDialogPresence(closing, second, false)).toEqual({ open: true, content: second });
  expect(dialogCloseDuration(false)).toBe(140);
});

it("removes the snapshot immediately with reduced motion", () => {
  expect(nextDialogPresence({ open: true, content: "last" }, null, true)).toEqual({ open: false, content: null });
  expect(dialogCloseDuration(true)).toBe(0);
});
