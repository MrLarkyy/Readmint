import { describe, expect, test } from "vitest";
import { glyphForCharacter } from "../src/glyphForCharacter.js";
import { shapeText } from "../src/shapeText.js";
import { buildTestFont, type TestGlyph } from "./buildTestFont.js";
import { coverage, layoutTable, struct } from "./buildLayoutTables.js";
import { parse } from "./testFonts.js";

const square = [
  [
    [0, 0, true],
    [400, 0, true],
    [400, 500, true],
    [0, 500, true],
  ],
] as const;
const glyph = (codePoint: number, advance: number): TestGlyph => ({
  codePoints: [codePoint],
  advance,
  contours: square,
});

function font(glyphs: readonly TestGlyph[], unitsPerEm = 1000, gpos?: [number, number, number][]) {
  return parse(
    buildTestFont({
      family: "Spaces",
      unitsPerEm,
      glyphs: [{ advance: 500 }, ...glyphs],
      ...(gpos === undefined ? {} : { gpos }),
    }),
  );
}

const base = (space: number) => [
  glyph(0x20, space),
  glyph(0x30, 560),
  glyph(0x2e, 200),
  glyph(0x2c, 210),
  glyph(0x2010, 330),
  glyph(0x2d, 300),
  glyph(0x61, 500),
];
const variants = [
  0xa0, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x202f, 0x205f, 0x3000,
];
const advances = (f: ReturnType<typeof font>, text: string) => shapeText(f, text).advances;

describe("space variants a font lacks", () => {
  test("take the space glyph with the HarfBuzz advance at upem 1000", () => {
    const f = font(base(250));
    for (const [index, codePoint] of variants.entries()) {
      const run = shapeText(f, String.fromCodePoint(codePoint));
      expect(run.glyphs).toEqual([1]);
      expect(run.advances[0]).toBe(
        [250, 500, 1000, 500, 1000, 333, 250, 167, 560, 200, 200, 63, 125, 222, 1000][index],
      );
    }
  });

  test("round in integers at upem 2048", () => {
    const f = font(base(513), 2048);
    const of = (codePoint: number) => advances(f, String.fromCodePoint(codePoint))[0];
    expect([0x2002, 0x2004, 0x2005, 0x2009, 0x2006, 0x200a, 0x205f, 0x202f].map(of)).toEqual([
      1024, 683, 512, 410, 341, 128, 455, 256,
    ]);
  });

  test("the figure space takes the first mapped digit, the punctuation space the period else the comma", () => {
    const seven = font([glyph(0x20, 250), glyph(0x37, 480)]);
    expect(advances(seven, "\u2007")).toEqual([480]);
    expect(advances(font([glyph(0x20, 250)]), "\u2007")).toEqual([250]);
    const comma = font([glyph(0x20, 250), glyph(0x2c, 210)]);
    expect(advances(comma, "\u2008")).toEqual([210]);
    expect(advances(font([glyph(0x20, 250)]), "\u2008")).toEqual([250]);
  });

  test("a font that maps the character keeps its own glyph and advance", () => {
    const f = font([glyph(0x20, 250), glyph(0x2009, 90)]);
    const run = shapeText(f, "\u2009");
    expect(run.glyphs).toEqual([2]);
    expect(run.advances).toEqual([90]);
  });

  test("a font without the space glyph keeps them missing", () => {
    const f = font([glyph(0x61, 500)]);
    expect(shapeText(f, "\u2003").glyphs).toEqual([0]);
  });

  test("kerning on the space glyph adds to the fallback advance", () => {
    const f = font(base(250), 1000, [[1, 7, -40]]);
    expect(advances(f, "\u2003a")).toEqual([960, 500]);
  });

  test("the canonical singletons shape like their equivalents", () => {
    const f = font(base(250));
    expect(shapeText(f, "\u2000a")).toEqual(shapeText(f, "\u2002a"));
    expect(shapeText(f, "\u2001a")).toEqual(shapeText(f, "\u2003a"));
  });
});

describe("U+2011 in a font without it", () => {
  test("takes the U+2010 glyph, else the hyphen-minus glyph, else stays missing", () => {
    const both = shapeText(font(base(250)), "\u2011");
    expect([both.glyphs, both.advances]).toEqual([[5], [330]]);
    const minus = shapeText(font([glyph(0x20, 250), glyph(0x2d, 300)]), "\u2011");
    expect([minus.glyphs, minus.advances]).toEqual([[2], [300]]);
    expect(shapeText(font([glyph(0x20, 250)]), "\u2011").glyphs).toEqual([0]);
    expect(shapeText(font([glyph(0x2011, 280), glyph(0x2010, 330)]), "\u2011").glyphs).toEqual([1]);
  });
});

describe("glyphForCharacter", () => {
  test("applies the shaping rule", () => {
    const f = font(base(250));
    expect(glyphForCharacter(f, 0x61)).toBe(7);
    expect(glyphForCharacter(f, 0x2009)).toBe(1);
    expect(glyphForCharacter(f, 0x2011)).toBe(5);
    expect(glyphForCharacter(f, 0x62)).toBe(0);
    expect(glyphForCharacter(font([glyph(0x2d, 300)]), 0x2011)).toBe(1);
    expect(glyphForCharacter(font([glyph(0x2d, 300)]), 0x2003)).toBe(0);
  });
});

describe("space variants and GSUB", () => {
  const glyphs = [
    { advance: 500 },
    { codePoints: [0x20], advance: 250 },
    { codePoints: [0x61], advance: 500 },
    { advance: 900 },
    { advance: 400 },
  ];
  const ligature = {
    type: 4,
    subtables: [
      struct([
        1,
        { offset: coverage([1]) },
        1,
        { offset: struct([1, { offset: struct([3, 2, 2]) }]) },
      ]),
    ],
  };
  const single = { type: 1, subtables: [struct([1, { offset: coverage([1]) }, { i16: 3 }])] };
  const gsubFont = (lookup: typeof ligature | typeof single, replacement = 900) =>
    parse(
      buildTestFont({
        family: "Gsub",
        glyphs: glyphs.map((g, i) => (i === 3 ? { advance: replacement } : g)),
        tables: { GSUB: layoutTable([{ tag: "ccmp", lookups: [0] }], [lookup]) },
      }),
    );

  test("a ligature that starts with the substituted space keeps the ligature advance", () => {
    const f = gsubFont(ligature);
    for (const space of [" ", " ", " "]) {
      const run = shapeText(f, `${space}a`);
      expect(run.glyphs).toEqual([3]);
      expect(run.advances).toEqual([900]);
    }
  });

  test("the space GSUB left in place gives the advance that U+00A0 keeps and U+202F halves", () => {
    const f = gsubFont(single, 400);
    expect(advances(f, " ")).toEqual([400]);
    expect(advances(f, " ")).toEqual([200]);
    expect(advances(f, " ")).toEqual([1000]);
  });
});
