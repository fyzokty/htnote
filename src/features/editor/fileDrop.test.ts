import { describe, expect, it, vi } from "vitest";

import { codeTagFor, copyFilesSequentially, fileName, kindFromPath, mediaFor, toCssPoint } from "@/features/editor/fileDrop";
import type { AssetInfo } from "@/lib/types";

describe("file drop conversion", () => {
  it.each([1, 1.5, 2])("converts physical coordinates at scale %s", (scale) => {
    expect(toCssPoint({ x: 150 * scale, y: 90 * scale }, scale)).toEqual({ x: 150, y: 90 });
  });

  it("maps file kinds to visual attrs and HTML tags", () => {
    const cases = [
      ["photo.png", "image", '<img src="./assets/photo.png" alt="photo.png">'],
      ["diagram.SVG", "image", '<img src="./assets/diagram.SVG" alt="diagram.SVG">'],
      ["song.mp3", "audio", '<audio src="./assets/song.mp3" controls></audio>'],
      ["movie.mp4", "video", '<video src="./assets/movie.mp4" controls></video>'],
      ["doc.pdf", "file", '<a href="./assets/doc.pdf">doc.pdf</a>'],
    ] as const;
    for (const [name, kind, tag] of cases) {
      const asset: AssetInfo = { relPath: `./assets/${name}`, kind, mime: "" };
      expect(kindFromPath(`C:\\Users\\Me\\${name}`)).toBe(kind);
      expect(mediaFor(asset, name)).toEqual({ relPath: asset.relPath, kind, name });
      expect(codeTagFor(asset, name)).toBe(tag);
    }
  });

  it("escapes names and asset paths", () => {
    const name = 'a&"<b>.pdf';
    const asset: AssetInfo = { relPath: './assets/a&"<b>.pdf', kind: "file", mime: "" };
    expect(fileName(`C:\\tmp\\${name}`)).toBe(name);
    expect(codeTagFor(asset, name)).toBe('<a href="./assets/a&amp;&quot;&lt;b&gt;.pdf">a&amp;&quot;&lt;b&gt;.pdf</a>');
  });
});

it("collects successful copies in order while continuing after an error", async () => {
  const order: string[] = [];
  const copy = vi.fn(async (path: string) => {
    order.push(`copy:${path}`);
    if (path === "bad") throw new Error("copy failed");
    return path.toUpperCase();
  });
  const onError = vi.fn((path: string) => { order.push(`error:${path}`); });
  const copied = await copyFilesSequentially(["first", "bad", "last"], copy, onError);
  expect(order).toEqual(["copy:first", "copy:bad", "error:bad", "copy:last"]);
  expect(copied).toEqual([{ result: "FIRST", path: "first" }, { result: "LAST", path: "last" }]);
  expect(onError).toHaveBeenCalledOnce();
});
