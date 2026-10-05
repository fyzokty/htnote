import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import classicSource from "./templateEngine.js?raw";
import { parseTemplate } from "@/features/editor/template";

describe("shared template parser", () => {
  const classic: { HTNOTE_TEMPLATE_ENGINE?: typeof HTNOTE_TEMPLATE_ENGINE } = {};
  runInNewContext(classicSource, classic);
  const parsers = [parseTemplate, classic.HTNOTE_TEMPLATE_ENGINE!.parseTemplate];

  it.each(parsers)("uses the same rules as a Vite import and a standalone classic script", (parse) => {
    const result = parse("Sayın {{ Ad Soyad }}, {{AD SOYAD|Ahmet}} / {{Ad Soyad|Son}}: {{no|42}}");
    expect(result.variables).toEqual([
      { key: "ad soyad", name: "Ad Soyad", defaultValue: "Ahmet" },
      { key: "no", name: "no", defaultValue: "42" },
    ]);
    expect(result.segments).toEqual([
      { text: "Sayın " }, { key: "ad soyad" }, { text: ", " }, { key: "ad soyad" },
      { text: " / " }, { key: "ad soyad" }, { text: ": " }, { key: "no" },
    ]);
    expect(parse("{{x|}}{{X|later}}").variables[0].defaultValue).toBe("");
    expect(parse("{{x| a|b\n }}").variables[0].defaultValue).toBe(" a|b\n ");
    expect(parse("{{x|a{b}c}}").variables[0].defaultValue).toBe("a{b}c");
    expect(parse("{{__proto__|safe}} {{constructor}}").variables).toHaveLength(2);
  });

  it.each(parsers)("keeps malformed names and nested tokens as literal source", (parse) => {
    const source = "{{}} {{  }} {{a\nb}} {{\nx}} {{a{b}} {{" + "x".repeat(41) + "}} {{unclosed";
    expect(parse(source)).toEqual({ variables: [], segments: [{ text: source }] });
    expect(parse("plain\n<&>")).toEqual({ variables: [], segments: [{ text: "plain\n<&>" }] });
    expect(parse("")).toEqual({ variables: [], segments: [] });
    expect(parse(`{{${"😀".repeat(40)}}}`).variables).toHaveLength(1);
    expect(parse(`{{${"😀".repeat(41)}}}`).variables).toHaveLength(0);
  });

  it.each(parsers)("limits distinct variables to 30 while retaining recognized repeats", (parse) => {
    const source = Array.from({ length: 31 }, (_, index) => `{{v${index}}}`).join(" ") + " {{V0|default}} {{v31}}";
    const result = parse(source);
    expect(result.variables).toHaveLength(30);
    expect(result.variables[0]).toEqual({ key: "v0", name: "v0", defaultValue: "default" });
    expect(result.segments.slice(-3)).toEqual([{ text: " {{v30}} " }, { key: "v0" }, { text: " {{v31}}" }]);
    expect(parse(source)).toEqual(result);
  });
});
