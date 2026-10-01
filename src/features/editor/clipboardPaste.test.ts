import { describe, expect, it, vi } from "vitest";

import { classifyClipboard, decodeDataUrl, extFromMime, pasteFileName, rewriteDataUrlImages, shouldWarnExternalImages } from "@/features/editor/clipboardPaste";

function clipboard(html = "", files: File[] = []) {
  return { files, getData: (type: string) => type === "text/html" ? html : "" };
}

describe("clipboard classification", () => {
  it("prioritizes files over HTML", () => {
    expect(classifyClipboard(clipboard('<img src="data:image/png;base64,AA==">', [new File(["x"], "image.png")]))).toBe("files");
  });

  it("recognizes embedded, external, and plain content", () => {
    expect(classifyClipboard(clipboard('<img src="data:image/png;base64,AA==">'))).toBe("dataUrlHtml");
    expect(classifyClipboard(clipboard('<img src="https://example.com/image.png">'))).toBe("externalImages");
    expect(classifyClipboard(clipboard("<p>Text</p>"))).toBe("plain");
    expect(classifyClipboard(clipboard())).toBe("plain");
  });
});

it("names pasted files with local timestamp and MIME extension", () => {
  const date = new Date(2026, 9, 2, 3, 4, 5);
  expect(pasteFileName(date, "image/jpeg")).toBe("yapistirilan-20261002-030405.jpg");
  expect(pasteFileName(date, "unknown/type")).toBe("yapistirilan-20261002-030405.png");
  expect(extFromMime("image/webp")).toBe("webp");
});

it("decodes base64 and URL encoded image bytes without Node Buffer", () => {
  expect(decodeDataUrl("data:image/png;base64,AAECAw==")).toEqual({ mime: "image/png", bytes: Uint8Array.from([0, 1, 2, 3]) });
  expect(decodeDataUrl("data:image/svg+xml,%3Csvg%3E")).toEqual({ mime: "image/svg+xml", bytes: new TextEncoder().encode("<svg>") });
  expect(() => decodeDataUrl("data:text/plain;base64,QQ==")).toThrow();
  expect(() => decodeDataUrl("invalid")).toThrow();
});

it("rewrites only data URL images in their original order", async () => {
  const saver = vi.fn(async () => "./assets/pasted.png");
  const html = '<p>Before</p><img src="data:image/png;base64,AA=="><img src="https://example.com/a.png">';
  const rewritten = await rewriteDataUrlImages(html, saver);
  expect(rewritten).toContain('src="./assets/pasted.png"');
  expect(rewritten).toContain('src="https://example.com/a.png"');
  expect(saver).toHaveBeenCalledExactlyOnceWith("data:image/png;base64,AA==");
});

it("warns about external images only once per session", () => {
  expect(shouldWarnExternalImages()).toBe(true);
  expect(shouldWarnExternalImages()).toBe(false);
});
