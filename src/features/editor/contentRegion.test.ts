import { describe, expect, it } from "vitest";

import { extractContent, replaceContent } from "@/features/editor/contentRegion";

const wrap = (inner: string) => `<!doctype html><html><body><main id="htnote-content">${inner}</main></body></html>`;

const fixtures = [
  wrap("<p>Hoş geldiniz</p>"),
  wrap("<h1>Welcome</h1><p>First note</p>"),
  wrap("<script>const x = '<main>';</script><p>Hi</p>"),
  wrap("<main><p>İçteki metin</p></main>"),
  wrap("<!-- açıklama --><p>Metin</p>"),
  wrap(""),
  wrap("\r\n<p>CRLF</p>\r\n"),
  `\uFEFF${wrap("<p>BOM</p>")}`,
  wrap("<p>Türkçe: ğüşiöç 🇹🇷 😀</p>"),
  `<main class='note' data-key="a>b" id='htnote-content'><p>A</p></main>`,
  `<html><head><title>Not</title></head><body>${wrap("<p>A</p>")}<footer>B</footer></body></html>`,
  wrap("<p data-html='&lt;main&gt;'>escaped</p>"),
  wrap("<p>one</p>\n\n<p>two</p>"),
  wrap("<table><tr><td>Hücre</td></tr></table>"),
  wrap("<p>Á &amp; Ω</p>"),
  `<main id=htnote-content>\r\n<p>Ö</p>\r\n</main>`,
  `<MAIN ID="htnote-content"><p>Case</p></MAIN>`,
];

describe("contentRegion", () => {
  it.each(fixtures)("round-trips original HTML: %s", (html) => {
    const result = extractContent(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(replaceContent(result, result.inner)).toBe(html);
    expect(replaceContent(result, "<p>Yeni</p>")).toBe(result.before + "<p>Yeni</p>" + result.after);
  });

  it.each([
    ["<html><body><p>No main</p></body></html>", "NO_MAIN"],
    ["<main id='other'>A</main>", "NO_MAIN"],
    ["<main id='htnote-content'>A</main><main id='htnote-content'>B</main>", "MULTIPLE_MAIN"],
    ["<main id='htnote-content'>A<main id='htnote-content'>B</main></main>", "MULTIPLE_MAIN"],
    ["<main id='htnote-content'><p>Unclosed", "MALFORMED_MAIN"],
  ] as const)("returns %s error", (html, reason) => {
    expect(extractContent(html)).toEqual({ ok: false, reason });
  });
});
