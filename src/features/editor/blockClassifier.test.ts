import { describe, expect, it } from "vitest";

import { classifyTopLevel } from "@/features/editor/blockClassifier";

describe("blockClassifier", () => {
  it.each([
    ["<p class='note'><strong>a</strong></p>", "rich"],
    ["<table><thead><tr><th colspan='2'>A</th></tr></thead><tbody><tr><td>B</td></tr></tbody></table>", "rich"],
    ["<ul><li>One</li><li><em>Two</em></li></ul>", "rich"],
    ["<p><a href='https://example.com' title='Link'>Go</a></p>", "rich"],
    ["<p><img src='a.png' alt='A'></p>", "rich"],
    ["<audio src='a.mp3' controls></audio>", "rich"],
    ["<video src='a.mp4' controls poster='p.png'></video>", "rich"],
    ["<p data-key='1' id='x' style='color:red'>A</p>", "rich"],
    ["<div class='card'><button onclick='x()'>A</button></div>", "raw"],
    ["<canvas></canvas>", "raw"],
    ["<svg><circle></circle></svg>", "raw"],
    ["<p>A<script>alert(1)</script></p>", "raw"],
    ["<iframe src='a'></iframe>", "raw"],
    ["<p onclick='alert(1)'>A</p>", "raw"],
    ["<p custom='x'>A</p>", "raw"],
    ["<a href='javascript:alert(1)'>A</a>", "raw"],
    ["<p><!-- comment --></p>", "raw"],
    ["Plain text", "raw"],
    ["<!-- comment -->", "raw"],
  ] as const)("classifies %s as %s", (html, kind) => {
    expect(classifyTopLevel(html)).toEqual([{ kind, html }]);
  });

  it("keeps exact source slices and skips only top-level whitespace", () => {
    const html = " \r\n<p class='a'>A</p>\n<!-- stay -->\n<canvas>x</canvas>\tText ";
    expect(classifyTopLevel(html)).toEqual([
      { kind: "rich", html: "<p class='a'>A</p>" },
      { kind: "raw", html: "<!-- stay -->" },
      { kind: "raw", html: "<canvas>x</canvas>" },
      { kind: "raw", html: "\tText " },
    ]);
  });
});
