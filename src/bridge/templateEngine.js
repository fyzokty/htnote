// Klasik script: Vite yan etki içe aktarımı ve Rust include_str! aynı saf işlevi kullanır.
(() => {
  "use strict";
  function parseTemplate(source) {
    const variables = [], segments = [], names = new Map(), defaults = new Set();
    const tokens = /\{\{([\s\S]*?)\}\}/g;
    let cursor = 0;
    for (const match of source.matchAll(tokens)) {
      const separator = match[1].indexOf("|");
      const rawName = separator < 0 ? match[1] : match[1].slice(0, separator);
      const name = rawName.trim(), key = name.toLowerCase();
      // Satır sonu kırpılınca da hatalı ad geçerli hale gelmemeli.
      if (!name || Array.from(name).length > 40 || /[{}|\r\n\u2028\u2029]/.test(rawName)) continue;
      let variable = names.get(key);
      if (!variable) {
        if (variables.length === 30) continue;
        variable = { key, name, defaultValue: "" };
        names.set(key, variable);
        variables.push(variable);
      }
      // İlk açık varsayılan geçerlidir; açık boş varsayılan da bir tanımdır.
      if (separator >= 0 && !defaults.has(key)) {
        variable.defaultValue = match[1].slice(separator + 1);
        defaults.add(key);
      }
      if (match.index > cursor) segments.push({ text: source.slice(cursor, match.index) });
      segments.push({ key });
      cursor = match.index + match[0].length;
    }
    if (cursor < source.length) segments.push({ text: source.slice(cursor) });
    return { variables, segments };
  }
  globalThis.HTNOTE_TEMPLATE_ENGINE = Object.freeze({ parseTemplate });
})();
