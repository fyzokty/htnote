import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { loadForVisual, saveFromVisual } from "@/features/editor/visualPipeline";
import { formatHtml } from "@/features/editor/formatHtml";

describe("formatHtml", () => {
  it("indents nested block elements with two spaces", () => {
    expect(formatHtml('<div><h1>Title</h1><p>A</p><ul><li><p>One</p></li><li><p>Two</p></li></ul><blockquote><p>Quote</p></blockquote><hr></div>'))
      .toBe('<div>\n  <h1>Title</h1>\n  <p>A</p>\n  <ul>\n    <li>\n      <p>One</p>\n    </li>\n    <li>\n      <p>Two</p>\n    </li>\n  </ul>\n  <blockquote>\n    <p>Quote</p>\n  </blockquote>\n  <hr>\n</div>');
  });

  it.each(["pre", "textarea", "code", "script", "style"])("preserves %s source exactly", (tag) => {
    const protectedHtml = `<${tag} data-x='a&amp;b'>  first\r\n\tsecond <span> third </span>\n </${tag}>`;
    expect(formatHtml(`<div>${protectedHtml}</div>`)).toContain(protectedHtml);
  });

  it("preserves inline spaces, entities, line breaks, and attribute spelling", () => {
    const paragraph = '<p class=\'a\'>  A &nbsp; <strong>B  C</strong> \t<em>D</em>\r\n <code>x  y</code> <img src=x> end  </p>';
    expect(formatHtml(`<div>${paragraph}<p>Next</p></div>`)).toBe(`<div>\n  ${paragraph}\n  <p>Next</p>\n</div>`);
    expect(formatHtml('<div>A <img src=x> B</div>')).toBe('<div>A <img src=x> B</div>');
    expect(formatHtml('<p>&nbsp;</p>')).toBe('<p>&nbsp;</p>');
  });

  it("formats tables without inventing implicit tbody tags", () => {
    expect(formatHtml('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><p>C</p></td><td>D</td></tr></tbody></table>'))
      .toBe('<table>\n  <thead>\n    <tr>\n      <th>A</th>\n      <th>B</th>\n    </tr>\n  </thead>\n  <tbody>\n    <tr>\n      <td>\n        <p>C</p>\n      </td>\n      <td>D</td>\n    </tr>\n  </tbody>\n</table>');
    expect(formatHtml('<table><tr><td>A</td></tr></table>')).toBe('<table>\n  <tr>\n    <td>A</td>\n  </tr>\n</table>');
  });

  it("formats figures and media while preserving fallback text", () => {
    expect(formatHtml('<figure><img src="a.png"><figcaption> A  caption </figcaption></figure><video controls><source src="v.webm"></video><audio controls><source src="a.ogg"></audio>'))
      .toBe('<figure>\n  <img src="a.png">\n  <figcaption> A  caption </figcaption>\n</figure>\n<video controls>\n  <source src="v.webm">\n</video>\n<audio controls>\n  <source src="a.ogg">\n</audio>');
    expect(formatHtml('<audio controls><source src=x> Your browser does not support audio. </audio>'))
      .toBe('<audio controls><source src=x> Your browser does not support audio. </audio>');
  });

  it("preserves whitespace-sensitive containers and unknown inline elements", () => {
    const source = '<div style="white-space: pre-wrap"><p>A</p>  <p>B</p></div>';
    expect(formatHtml(source)).toBe(source);
    expect(formatHtml('<p>A</p> <custom-inline>B</custom-inline> C')).toBe('<p>A</p> <custom-inline>B</custom-inline> C');
  });

  it("preserves malformed source when HTML parsing reorders content", () => {
    const source = '<div><table>stray<tr><td>A</td></tr></table></div>';
    expect(formatHtml(source)).toBe(source);
  });

  it.each([
    '<div><p>A</p><div><p>B</p></div></div>',
    '<table><tr><td>A</td><td><p>B</p></td></tr></table>',
    '<img src=x><video><source src=y></video><audio src=z></audio>',
    '<div>\n  <pre> a\r\n b </pre>\n  <p> A  <strong>B</strong> C </p>\n</div>',
    '<!DOCTYPE html><html lang=\'tr\'><head><title>A</title><style>p { color: red; }\n</style></head><body><main id="htnote-content"><p>A</p><p>B</p></main><script>run()</script></body></html>',
  ])("is deterministic and idempotent for fixture %#", (source) => {
    const formatted = formatHtml(source);
    expect(formatHtml(source)).toBe(formatted);
    expect(formatHtml(formatted)).toBe(formatted);
  });
});

// Read the same built-in templates included by Rust, so formatting cannot drift.
describe("Rust note template formatting contract", () => {
  const paths = ["note.html", ...["tr", "en"].flatMap((language) =>
    ["welcome", "interactive"].map((name) => `onboarding/${language}/${name}.html`))];
  it.each(paths)("keeps %s unchanged when formatting the document or saving visual content", (path) => {
    const source = readFileSync(`src-tauri/templates/${path}`, "utf8")
      .replace(/\{\{HTNOTE_TITLE\}\}/g, "Title &amp; more")
      .replace("{{HTNOTE_METADATA}}", '<meta name="htnote-created-at" content="2026-10-03T00:00:00.000Z">\n    <meta name="htnote-updated-at" content="2026-10-03T00:00:00.000Z">\n    <meta name="htnote-tags" content="">')
      .replace("{{NOTE_ID}}", "example-id").trimEnd();
    expect(formatHtml(source)).toBe(source);
    const parts = loadForVisual(source);
    if (!parts.ok) throw new Error(parts.reason);
    expect(saveFromVisual(parts, parts.editorHtml)).toBe(source);
  });
});
