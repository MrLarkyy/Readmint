import { describe, expect, test } from "vitest";
import { glyphClosure, MalformedFont } from "../src/index.js";
import { buildTestFont, type TestGlyph, type TestPoint } from "./buildTestFont.js";
import { parse } from "./testFonts.js";

const square: readonly TestPoint[] = [
  [0, 0, true],
  [0, 100, true],
  [100, 100, true],
  [100, 0, true],
];

const notdef: TestGlyph = { advance: 500 };
const base: TestGlyph = { codePoints: [0x41], advance: 200, contours: [square] };

/** Composites nested `depth` deep over the square: glyph 2 refers to 1, 3 to 2, and so on. */
function nested(depth: number): TestGlyph[] {
  const chain = Array.from({ length: depth }, (_, index) => ({
    advance: 200,
    components: [{ glyph: index + 1, dx: 10, dy: 0 }],
  }));
  return [notdef, base, ...chain];
}

describe("TrueType outlines", () => {
  test("a simple glyph: off-curve points become quadratic curves, Z closes the contour", () => {
    const font = parse(
      buildTestFont({
        family: "T",
        glyphs: [
          notdef,
          {
            codePoints: [0x41],
            advance: 300,
            contours: [
              [
                [0, 0, true],
                [0, 100, false],
                [100, 100, false],
                [100, 0, true],
              ],
            ],
          },
        ],
      }),
    );
    expect(font.outline(1)).toEqual([
      { type: "M", x: 0, y: 0 },
      { type: "Q", x1: 0, y1: 100, x: 50, y: 100 },
      { type: "Q", x1: 100, y1: 100, x: 100, y: 0 },
      { type: "Z" },
    ]);
  });

  test("a contour of off-curve points only starts between its last and first point", () => {
    const font = parse(
      buildTestFont({
        family: "T",
        glyphs: [
          notdef,
          {
            advance: 300,
            contours: [
              [
                [0, 0, false],
                [0, 100, false],
                [100, 100, false],
                [100, 0, false],
              ],
            ],
          },
        ],
      }),
    );
    const outline = font.outline(1);
    expect(outline[0]).toEqual({ type: "M", x: 50, y: 0 });
    expect(outline.filter((command) => command.type === "Q")).toHaveLength(4);
  });

  test("a composite glyph draws its components moved by their offsets", () => {
    const font = parse(
      buildTestFont({
        family: "T",
        glyphs: [
          notdef,
          base,
          {
            advance: 400,
            components: [
              { glyph: 1, dx: 0, dy: 0 },
              { glyph: 1, dx: 200, dy: 50 },
            ],
          },
        ],
      }),
    );
    const outline = font.outline(2);
    expect(outline.filter((command) => command.type === "M")).toEqual([
      { type: "M", x: 0, y: 0 },
      { type: "M", x: 200, y: 50 },
    ]);
    expect(glyphClosure(font, [2])).toEqual([0, 1, 2]);
  });

  test("composites nested 8 deep are read; 9 deep are malformed", () => {
    const eight = parse(buildTestFont({ family: "T", glyphs: nested(8) }));
    expect(eight.outline(9)[0]).toEqual({ type: "M", x: 80, y: 0 });
    const nine = parse(buildTestFont({ family: "T", glyphs: nested(9) }));
    expect(() => nine.outline(10)).toThrow(MalformedFont);
  });

  test("a composite that refers to itself is malformed, also when collecting components", () => {
    const font = parse(
      buildTestFont({
        family: "T",
        glyphs: [
          notdef,
          base,
          { advance: 200, components: [{ glyph: 3, dx: 0, dy: 0 }] },
          { advance: 200, components: [{ glyph: 2, dx: 0, dy: 0 }] },
        ],
      }),
    );
    expect(() => font.outline(2)).toThrow(MalformedFont);
    expect(glyphClosure(font, [2])).toEqual([0, 2, 3]);
  });

  test("a glyph outside the font is malformed", () => {
    const font = parse(buildTestFont({ family: "T", glyphs: [notdef, base] }));
    expect(() => font.outline(2)).toThrow(MalformedFont);
    expect(() => glyphClosure(font, [5])).toThrow(MalformedFont);
  });
});
