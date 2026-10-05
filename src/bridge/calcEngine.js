// Klasik script: editör ve iframe aynı sınırlı, saf ayrıştırıcıyı kullanır.
(() => {
  "use strict";
  const MAX_LINES = 500, MAX_LINE_LENGTH = 500, MAX_DEPTH = 64;
  const nameKey = (name) => name.toLowerCase().replace(/\u0307/g, "");
  const totalNames = new Set(["toplam", "total"]);
  function evaluateCalc(source, locale = "tr") {
    locale = locale === "en" ? "en" : "tr";
    const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
    const format = (value) => formatter.format(Math.abs(value) < 0.0000005 ? 0 : value);
    const error = () => ({ status: "error", value: null, formatted: "?" });
    // Büyük kaynaklar bölünmeden reddedilir; hiçbir kısmi toplam üretilmez.
    if (source.length > MAX_LINES * (MAX_LINE_LENGTH + 2)) return { lines: [error()], total: 0, formattedTotal: format(0), limited: true };
    const rawLines = source.split(/\r\n|[\r\n]/, MAX_LINES + 1);
    if (rawLines.length > MAX_LINES) return { lines: rawLines.map(error), total: 0, formattedTotal: format(0), limited: true };
    const variables = new Map();
    let total = 0, previous = 0;
    const lines = rawLines.map((raw) => {
      if (raw.length > MAX_LINE_LENGTH) return error();
      let expression = raw.trim();
      if (!expression || /^(#|\/\/)/.test(expression)) return { status: "empty", value: null, formatted: "" };
      const separator = expression.search(/[=:]/);
      const label = separator < 0 ? "" : expression.slice(0, separator).trim();
      if (separator >= 0) expression = expression.slice(separator + 1).trim();
      let cursor = 0, depth = 0, usesTotal = totalNames.has(nameKey(label));
      const fail = () => { throw new Error("Invalid calculation"); };
      const finite = (value) => { if (!Number.isFinite(value)) fail(); return value; };
      const skip = () => { while (/\s/.test(expression[cursor] || "") && cursor < expression.length) cursor++; };
      const peek = () => { skip(); return expression[cursor]; };
      const take = () => { skip(); return expression[cursor++]; };
      const nested = (parse) => { if (++depth > MAX_DEPTH) fail(); try { return parse(); } finally { depth--; } };
      function primary() {
        const next = peek();
        if (next === "(") { take(); const value = nested(additive); if (take() !== ")") fail(); return { value: value.value }; }
        if (next === "%") { take(); return { value: finite(nested(primary).value / 100), percent: true }; }
        const number = expression.slice(cursor).match(/^(?:\d[\d.,]*|[.,]\d+)/u);
        if (number) {
          cursor += number[0].length;
          let text = number[0];
          const grouping = locale === "tr" ? /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/ : /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
          if (grouping.test(text)) text = text.replace(locale === "tr" ? /\./g : /,/g, "");
          // Yanlış gruplama yalnız tek ondalık ayırıcı olduğunda ondalıktır.
          if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) fail();
          return { value: finite(Number(text.replace(",", "."))) };
        }
        const name = expression.slice(cursor).match(/^[\p{L}_][\p{L}\p{N}_]*/u);
        if (!name) fail();
        cursor += name[0].length;
        const key = nameKey(name[0]);
        if (totalNames.has(key)) { usesTotal = true; return { value: total }; }
        if (key === "önceki" || key === "prev") return { value: previous };
        if (!variables.has(key)) fail();
        return { value: variables.get(key) };
      }
      function power() {
        let result = primary();
        if (peek() === "%") { take(); result = { value: finite(result.value / 100) }; }
        if (peek() === "^") { take(); result = { value: finite(result.value ** nested(unary).value) }; }
        return result;
      }
      function unary() {
        if (["+", "-", "−"].includes(peek())) { const sign = take(); return { value: finite((sign === "+" ? 1 : -1) * nested(unary).value) }; }
        return power();
      }
      function multiplicative() {
        let result = unary();
        while (["*", "×", "/", "÷"].includes(peek())) {
          const op = take(), right = unary().value;
          if ((op === "/" || op === "÷") && right === 0) fail();
          result = { value: finite(op === "*" || op === "×" ? result.value * right : result.value / right) };
        }
        return result;
      }
      function additive() {
        let result = multiplicative();
        while (["+", "-", "−"].includes(peek())) {
          const op = take(), right = multiplicative();
          const value = right.percent ? result.value * right.value : right.value;
          result = { value: finite(result.value + (op === "+" ? value : -value)) };
        }
        return result;
      }
      try {
        if (separator >= 0 && !label) fail();
        const value = finite(additive().value);
        if (peek() !== undefined) fail();
        const nextTotal = usesTotal ? total : finite(total + value);
        if (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(label)) variables.set(nameKey(label), value);
        previous = value; total = nextTotal;
        return { status: "ok", value, formatted: format(value) };
      } catch { return error(); }
    });
    return { lines, total, formattedTotal: format(total), limited: false };
  }
  globalThis.HTNOTE_CALC_ENGINE = Object.freeze({ evaluateCalc });
})();
