import { describe, expect, test } from "vitest";
import { buildTestFont, type TestGlyph } from "./buildTestFont.js";
import { montserrat, parse } from "./testFonts.js";

const glyphs: TestGlyph[] = [
  { advance: 500 },
  { codePoints: [0x41], advance: 600 },
  { codePoints: [0x56], advance: 600 },
  { codePoints: [0x54], advance: 600 },
];

describe("kerning", () => {
  test("a version 0 kern table, format 0", () => {
    const font = parse(
      buildTestFont({
        family: "K",
        glyphs,
        kern: [
          [1, 2, -80],
          [3, 1, -20],
        ],
      }),
    );
    expect(font.kerning(1, 2)).toBe(-80);
    expect(font.kerning(3, 1)).toBe(-20);
    expect(font.kerning(2, 1)).toBe(0);
  });

  test("GPOS pair adjustment, format 1, under feature kern of script DFLT", () => {
    const font = parse(
      buildTestFont({
        family: "K",
        glyphs,
        gpos: [
          [1, 2, -70],
          [1, 3, -10],
          [2, 1, 15],
        ],
      }),
    );
    expect(font.kerning(1, 2)).toBe(-70);
    expect(font.kerning(1, 3)).toBe(-10);
    expect(font.kerning(2, 1)).toBe(15);
    expect(font.kerning(3, 3)).toBe(0);
  });

  test("GPOS wins over the kern table", () => {
    const font = parse(
      buildTestFont({
        family: "K",
        glyphs,
        kern: [
          [1, 2, -80],
          [3, 1, -20],
        ],
        gpos: [[1, 2, -70]],
      }),
    );
    expect(font.kerning(1, 2)).toBe(-70);
    expect(font.kerning(3, 1)).toBe(0);
  });

  test("Montserrat kerns AV and To (GPOS class pairs) in every container", () => {
    for (const bytes of [montserrat.ttf, montserrat.otf, montserrat.woff, montserrat.woff2]) {
      const font = parse(bytes);
      const pair = (left: string, right: string) =>
        font.kerning(font.glyphFor(left.charCodeAt(0)), font.glyphFor(right.charCodeAt(0)));
      expect(pair("A", "V")).toBeLessThan(0);
      expect(pair("T", "o")).toBeLessThan(0);
      expect(pair("o", "o")).toBe(0);
    }
  });

  test("a font without kerning gives 0", () => {
    expect(parse(buildTestFont({ family: "K", glyphs })).kerning(1, 2)).toBe(0);
  });
});
