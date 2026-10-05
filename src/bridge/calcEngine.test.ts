import { describe, expect, it } from "vitest";
import { evaluateCalc } from "@/features/editor/calc";

const value = (source: string, locale = "tr") => evaluateCalc(source, locale).lines[0].value;
describe("shared calculation engine", () => {
  it.each([
    ["2 + 3 * 4", 14], ["(2+3)*4", 20], ["2^3^2", 512], ["-2^2", -4], ["(-2)^2", 4], ["2^-2", 0.25],
    ["−8 ÷ 2 × -3", 12], ["+2 + --3", 5], ["10 / 4", 2.5], [" 2\t+ 3 ", 5],
    ["%20", 0.2], ["20%", 0.2], ["%20 * 4.000", 800], ["4.000 * 20%", 800],
    ["100 + %20", 120], ["100 - %20", 80], ["100 − %20", 80], ["100 + 20%", 100.2],
    ["100 + (%20)", 100.2], ["100 + %20 * 2", 100.4], ["100 + 2 * %20", 100.4],
    ["%20^2", 0.04], ["(20%)^2", 0.04], ["100 + %20^2", 100.04], ["100 + %20 + %10", 132], ["100 * %20", 20], ["100 / %20", 500], ["2^20%", 2 ** 0.2],
  ])("parses operators and percent context: %s", (source, result) => expect(value(source)).toBeCloseTo(result));

  it.each([
    ["tr", "18.500", 18500], ["tr", "1.234.567,89", 1234567.89], ["tr", "34,20", 34.2],
    ["tr", "3.5", 3.5], ["tr", "1234.567", 1234.567], ["tr", "12.34", 12.34], ["tr", ",5", 0.5],
    ["en", "18,500", 18500], ["en", "1,234,567.89", 1234567.89], ["en", "34.20", 34.2],
    ["en", "3,5", 3.5], ["en", "1234,567", 1234.567], ["en", ".5", 0.5], ["unknown", "18.500", 18500],
  ])("uses locale and exact grouping: %s %s", (locale, source, result) => expect(value(source, locale)).toBe(result));

  it.each(["1.23.456", "1,23,456", "1.234,56.7", "1,234.56,7", "1..2", "2,", "2.", "2 3", "1e3", "0x10", "5/0", "0/0", "10^400", "(-1)^0,5", "unknown", "Math.PI", "alert(1)", "2**3", "(2", "2)", "", "x =", "= 2", "2 # tail"])("rejects unsafe or invalid expression: %s", (source) => {
    const line = evaluateCalc(source).lines[0];
    expect(line.status).toBe(source === "" ? "empty" : "error");
    expect(line.value).toBeNull();
  });

  it("ignores comments and blank lines and isolates failures from variables, previous and total", () => {
    const result = evaluateCalc("\n # comment\n // comment\nKira = 10\nKIRA: 20\nKira = 1/0\nkira + 1\nUnknown\nönceki\nTOPLAM\nTOTAL\nPrev\nTotal = 3\n5");
    expect(result.lines.map((line) => line.value)).toEqual([null, null, null, 10, 20, null, 21, null, 21, 72, 72, 72, 3, 5]);
    expect(result.total).toBe(149);
    expect(result.lines[5].formatted).toBe("?");
  });
  it("accepts Unicode identifiers, free labels and last successful redefinitions", () => {
    const result = evaluateCalc("İş_2: 5\nİŞ_2*2\nUlaşım bedeli = 3\n_foo = 4\n_foo\n9bad = 2\n9bad\nUlaşım\nÖNCEKİ");
    expect(result.lines.map((line) => line.value)).toEqual([5, 10, 3, 4, 4, 2, null, null, 2]);
    expect(result.total).toBe(30);
  });
  it("does not count subtotal expressions twice and starts special names at zero", () => {
    expect(evaluateCalc("prev\nönceki\ntotal\n2\nSnapshot = toplam + 3\n4\nTotal").lines.map((line) => line.value)).toEqual([0, 0, 0, 2, 5, 4, 6]);
    expect(evaluateCalc("2\nSnapshot = toplam + 3\n4").total).toBe(6);
  });
  it("formats at six digits, hides floating point artifacts and negative zero without a currency", () => {
    expect(evaluateCalc("0,1 + 0,2\n1/3\n-0\n-0,00000001\n1234567,12345678").lines.map((line) => line.formatted)).toEqual(["0,3", "0,333333", "0", "0", "1.234.567,123457"]);
    expect(evaluateCalc("0.1 + 0.2\n1234567.12345678", "en").lines.map((line) => line.formatted)).toEqual(["0.3", "1,234,567.123457"]);
    expect(evaluateCalc("0,1\n0,2").formattedTotal).toBe("0,3");
  });
  it("bounds lines, source size, long lines and all recursive operations", () => {
    expect(evaluateCalc(Array(500).fill("1").join("\n")).total).toBe(500);
    expect(evaluateCalc(Array(501).fill("1").join("\n"))).toMatchObject({ total: 0, limited: true });
    expect(evaluateCalc("1".repeat(300000))).toMatchObject({ total: 0, limited: true });
    expect(evaluateCalc(" ".repeat(499) + "1").total).toBe(1);
    expect(evaluateCalc(" ".repeat(500) + "1\n2").lines.map((line) => line.value)).toEqual([null, 2]);
    expect(value("(".repeat(64) + "1" + ")".repeat(64))).toBe(1);
    for (const expression of ["(".repeat(65) + "1" + ")".repeat(65), "-".repeat(65) + "1", Array(67).fill("1").join("^")]) {
      expect(evaluateCalc(expression + "\n2").lines.map((line) => line.value)).toEqual([null, 2]);
    }
  });
  it("is deterministic across calls and accepts CR, LF and CRLF", () => {
    expect(evaluateCalc("a=2\ra\r\n3\n4").total).toBe(11);
    expect(value("a")).toBeNull();
  });
});
