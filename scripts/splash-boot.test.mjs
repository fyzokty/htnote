import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "public", "splash-boot.js"), "utf8");
const html = readFileSync(join(process.cwd(), "index.html"), "utf8");

function boot({ mode, language, browser = "tr-TR", dark = false, blocked = false } = {}) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const context = {
    document: doc,
    navigator: { language: browser },
    window: { matchMedia: () => ({ matches: dark }) },
    localStorage: { getItem: (key) => {
      if (blocked) throw new Error("blocked");
      return key === "htnote.themeMode" ? mode : language;
    } },
  };
  return { doc, context };
}

describe("splash boot", () => {
  it.each([
    ["light", "en", "tr-TR", true, false, "en"],
    ["dark", "tr", "en-US", false, true, "tr"],
    [null, null, "TR-tr", true, true, "tr"],
    ["invalid", "invalid", "de-DE", false, false, "en"],
  ])("resolves cache and system values (%s, %s)", (mode, language, browser, dark, expectedDark, expectedLanguage) => {
    const { doc, context } = boot({ mode, language, browser, dark });
    runInNewContext(source, context);
    expect(doc.documentElement.classList.contains("dark")).toBe(expectedDark);
    expect(doc.documentElement.lang).toBe(expectedLanguage);
    const progress = doc.querySelector("[role=progressbar]");
    expect(progress.getAttribute("aria-label")).toBe(expectedLanguage === "tr" ? "Notlar hazırlanıyor…" : "Preparing notes…");
    expect(progress.children).toHaveLength(1);
    expect(doc.querySelector(".htnote-splash-tagline").textContent).toBe(expectedLanguage === "tr" ? "HTML notlarınız, yerel ve güvende" : "Your HTML notes, local and safe");
  });
  it("applies the theme in head and translates after markup synchronously", () => {
    const { doc, context } = boot({ mode: "dark", language: "en" });
    const markup = doc.body.innerHTML;
    doc.body.innerHTML = "";
    runInNewContext(source, context);
    expect(doc.documentElement.classList.contains("dark")).toBe(true);
    doc.body.innerHTML = markup;
    runInNewContext(source, context);
    expect(doc.querySelector(".htnote-splash-status").textContent).toBe("Preparing notes…");
  });
  it("uses system preferences with blocked storage", () => {
    const { doc, context } = boot({ blocked: true, dark: true, browser: "en-US" });
    expect(() => runInNewContext(source, context)).not.toThrow();
    expect(doc.documentElement.lang).toBe("en");
    expect(doc.documentElement.classList.contains("dark")).toBe(true);
  });
  it("preserves light Turkish markup if boot fails", () => {
    const { doc, context } = boot();
    context.window.matchMedia = () => { throw new Error("unavailable"); };
    expect(() => runInNewContext(source, context)).not.toThrow();
    expect(doc.documentElement.lang).toBe("tr");
    expect(doc.documentElement.classList.contains("dark")).toBe(false);
    expect(doc.querySelector(".htnote-splash-status").textContent).toBe("Notlar hazırlanıyor…");
  });
});
