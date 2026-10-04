import { describe, expect, it } from "vitest";
import { displayPath } from "./displayPath";

describe("displayPath", () => {
  it.each([
    [String.raw`\\?\C:\Users\Ada\HTNote`, String.raw`C:\Users\Ada\HTNote`],
    ["\\\\?\\c:\\", "c:\\"],
    [String.raw`\\?\UNC\server\share\Notes`, String.raw`\\server\share\Notes`],
    [String.raw`C:\Notes`, String.raw`C:\Notes`],
    [String.raw`\\server\share`, String.raw`\\server\share`],
    ["/home/ada/Notes", "/home/ada/Notes"],
    ["", ""],
    ["\\\\?\\Volume{abc}\\", "\\\\?\\Volume{abc}\\"],
    [String.raw`\\.\C:\Notes`, String.raw`\\.\C:\Notes`],
  ])("formats %s without normalizing the actual path", (path, expected) => {
    expect(displayPath(path)).toBe(expected);
  });
});
