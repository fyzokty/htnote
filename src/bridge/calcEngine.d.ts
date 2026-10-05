export interface CalcLine { status: "empty" | "ok" | "error"; value: number | null; formatted: string }
export interface CalcResult { lines: CalcLine[]; total: number; formattedTotal: string; limited: boolean }
declare global {
  var HTNOTE_CALC_ENGINE: Readonly<{ evaluateCalc(source: string, locale?: string): CalcResult }>;
}
