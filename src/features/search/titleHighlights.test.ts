import { expect, it } from "vitest";
import { titleHighlights } from "./titleHighlights";

it("highlights every normalized Turkish match without altering the original title", () => {
  const parts = titleHighlights("İŞ planı / iş", "IS");
  expect(parts.filter((part) => part.match).map((part) => part.text)).toEqual(["İŞ", "iş"]);
  expect(parts.map((part) => part.text).join("")).toBe("İŞ planı / iş");
});
it("maps composed and decomposed accents to their complete original graphemes", () => {
  const title = "cafe\u0301 / café";
  expect(titleHighlights(title, "cafe").filter((part) => part.match).map((part) => part.text)).toEqual(["cafe\u0301", "café"]);
});
it("preserves empty queries, missing matches and literal HTML safely as text", () => {
  expect(titleHighlights("<img> note", "missing")).toEqual([{ text: "<img> note", match: false }]);
  expect(titleHighlights("note", " ")).toEqual([{ text: "note", match: false }]);
});
