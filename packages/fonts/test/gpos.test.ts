import { describe, expect, test } from "vitest";
import {
  anchor,
  classDef,
  coverage,
  extension,
  struct,
  type TestLookup,
} from "./buildLayoutTables.js";
import { glyph, layoutFont, shaped } from "./layoutFont.js";

const { a, b, d, e, acute, grave, ligatureAb } = glyph;

function fontWith(lookups: readonly TestLookup[], options: Parameters<typeof layoutFont>[0] = {}) {
  return layoutFont({ ...options, gpos: { features: [{ tag: "kern", lookups: [0] }], lookups } });
}

const pairAB = (flag = 0, markFilteringSet?: number): TestLookup => ({
  type: 2,
  flag,
  subtables: [
    struct([1, { offset: coverage([a]) }, 0x0004, 0, 1, { offset: struct([1, b, { i16: -50 }]) }]),
  ],
  ...(markFilteringSet === undefined ? {} : { markFilteringSet }),
});

const markToBase: TestLookup = {
  type: 4,
  subtables: [
    struct([
      1,
      { offset: coverage([acute]) },
      { offset: coverage([a, b]) },
      1,
      { offset: struct([1, 0, { offset: anchor(100, 0) }]) },
      { offset: struct([2, { offset: anchor(250, 600) }, { offset: anchor(300, 700) }]) },
    ]),
  ],
};

describe("GPOS lookup types", () => {
  test("1 single, formats 1 and 2", () => {
    const format1 = fontWith([
      {
        type: 1,
        subtables: [
          struct([1, { offset: coverage([a]) }, 0x0007, { i16: 30 }, { i16: 20 }, { i16: 40 }]),
        ],
      },
    ]);
    const run = shaped(format1, "a");
    expect([run.xOffsets[0], run.yOffsets[0], run.advances[0]]).toEqual([30, 20, 540]);
    const format2 = fontWith([
      {
        type: 1,
        subtables: [struct([2, { offset: coverage([a, b]) }, 0x0004, 2, { i16: 10 }, { i16: 20 }])],
      },
    ]);
    expect(shaped(format2, "ab").advances).toEqual([510, 520]);
  });

  test("2 pair, format 1 (glyph pairs) and format 2 (class pairs)", () => {
    expect(shaped(fontWith([pairAB()]), "ab").advances).toEqual([450, 500]);
    expect(shaped(fontWith([pairAB()]), "ba").advances).toEqual([500, 500]);
    const format2 = fontWith([
      {
        type: 2,
        subtables: [
          struct([
            2,
            { offset: coverage([a]) },
            0x0004,
            0,
            { offset: classDef([[a, 1]]) },
            { offset: classDef([[b, 1]]) },
            2,
            2,
            { i16: 0 },
            { i16: 0 },
            { i16: 0 },
            { i16: -60 },
          ]),
        ],
      },
    ]);
    expect(shaped(format2, "ab").advances).toEqual([440, 500]);
    expect(shaped(format2, "aa").advances).toEqual([500, 500]);
  });

  test("pair kerning skips a mark its lookup ignores (RM-14 review), and stops at one it does not", () => {
    expect(shaped(fontWith([pairAB(0x0008)]), "a\u0301b").advances).toEqual([450, 0, 500]);
    expect(shaped(fontWith([pairAB()]), "a\u0301b").advances).toEqual([500, 0, 500]);
  });

  test("a mark filtering set: marks outside it are skipped", () => {
    const options = { markSets: [[grave]] };
    expect(shaped(fontWith([pairAB(0x0010, 0)], options), "a\u0301b").advances[0]).toBe(450);
    expect(shaped(fontWith([pairAB(0x0010, 0)], options), "a\u0300b").advances[0]).toBe(500);
  });

  test("a mark attachment type: marks of another class are skipped", () => {
    const options = {
      attachClasses: [
        [acute, 1],
        [grave, 2],
      ] as const,
    };
    expect(shaped(fontWith([pairAB(0x0100)], options), "a\u0301b").advances[0]).toBe(500);
    expect(shaped(fontWith([pairAB(0x0100)], options), "a\u0300b").advances[0]).toBe(450);
  });

  test("kerning false keeps the marks attached", () => {
    const font = layoutFont({
      gpos: {
        features: [
          { tag: "kern", lookups: [0] },
          { tag: "mark", lookups: [1] },
        ],
        lookups: [pairAB(0x0008), markToBase],
      },
    });
    const run = shaped(font, "a\u0301b", { kerning: false });
    expect(run.advances).toEqual([500, 0, 500]);
    expect(run.yOffsets[1]).toBe(600);
  });

  test("4 mark-to-base: the mark's anchor on the base's, its advance zeroed", () => {
    const run = shaped(fontWith([markToBase]), "a\u0301");
    expect(run.advances).toEqual([500, 0]);
    expect(run.xOffsets[1]).toBe(250 - 100 - 500);
    expect(run.yOffsets[1]).toBe(600);
    expect(run.marks).toEqual([false, true]);
  });

  test("5 mark-to-ligature: a mark between components goes on its component, a mark after on the last", () => {
    const ligature: TestLookup = {
      type: 4,
      flag: 0x0008,
      subtables: [
        struct([
          1,
          { offset: coverage([a]) },
          1,
          { offset: struct([1, { offset: struct([ligatureAb, 2, b]) }]) },
        ]),
      ],
    };
    const markToLigature: TestLookup = {
      type: 5,
      subtables: [
        struct([
          1,
          { offset: coverage([acute]) },
          { offset: coverage([ligatureAb]) },
          1,
          { offset: struct([1, 0, { offset: anchor(0, 0) }]) },
          {
            offset: struct([
              1,
              { offset: struct([2, { offset: anchor(100, 500) }, { offset: anchor(400, 520) }]) },
            ]),
          },
        ]),
      ],
    };
    const font = layoutFont({
      gsub: { features: [{ tag: "liga", lookups: [0] }], lookups: [ligature] },
      gpos: { features: [{ tag: "mark", lookups: [0] }], lookups: [markToLigature] },
    });
    const between = shaped(font, "a\u0301b");
    expect(between.glyphs).toEqual([ligatureAb, acute]);
    expect([between.xOffsets[1], between.yOffsets[1]]).toEqual([100 - 900, 500]);
    const after = shaped(font, "ab\u0301");
    expect([after.xOffsets[1], after.yOffsets[1]]).toEqual([400 - 900, 520]);
  });

  test("6 mark-to-mark: a mark on the mark before it", () => {
    const markToMark: TestLookup = {
      type: 6,
      subtables: [
        struct([
          1,
          { offset: coverage([grave]) },
          { offset: coverage([acute]) },
          1,
          { offset: struct([1, 0, { offset: anchor(0, 0) }]) },
          { offset: struct([1, { offset: anchor(20, 300) }]) },
        ]),
      ],
    };
    const font = layoutFont({
      gpos: {
        features: [
          { tag: "mark", lookups: [0] },
          { tag: "mkmk", lookups: [1] },
        ],
        lookups: [markToBase, markToMark],
      },
    });
    const run = shaped(font, "a\u0301\u0300");
    expect(run.yOffsets).toEqual([0, 600, 900]);
    expect(run.xOffsets[2]).toBe(-350 + 20);
  });

  test("3 cursive: the exit of one glyph meets the entry of the next", () => {
    const font = fontWith([
      {
        type: 3,
        subtables: [
          struct([
            1,
            { offset: coverage([d, e]) },
            2,
            { offset: null },
            { offset: anchor(450, 100) },
            { offset: anchor(30, 0) },
            { offset: null },
          ]),
        ],
      },
    ]);
    const run = shaped(font, "de");
    expect(run.advances).toEqual([450, 470]);
    expect(run.xOffsets).toEqual([0, -30]);
    expect(run.yOffsets).toEqual([0, 100]);
  });

  test("8 chained context positioning and 9 extension", () => {
    const placeA: TestLookup = {
      type: 1,
      subtables: [struct([1, { offset: coverage([a]) }, 0x0002, { i16: 77 }])],
    };
    const chained = struct([
      3,
      0,
      1,
      { offset: coverage([a]) },
      1,
      { offset: coverage([b]) },
      1,
      0,
      1,
    ]);
    const font = fontWith([{ type: 9, subtables: [extension(8, chained)] }, placeA]);
    expect(shaped(font, "ab").yOffsets).toEqual([77, 0]);
    expect(shaped(font, "aa").yOffsets).toEqual([0, 0]);
  });

  test("right to left: glyphs come out in visual order, marks still on their base", () => {
    const run = shaped(fontWith([markToBase]), "a\u0301b", { rtl: true });
    expect(run.glyphs).toEqual([b, acute, a]);
    expect(run.clusters).toEqual([2, 0, 0]);
    // The mark's pen position is the base's left edge in visual order: it moves by the anchor only.
    expect(run.xOffsets[1]).toBe(250 - 100);
  });

  test("a font without GPOS kerns with its kern table, across marks; a mark hangs over its base", () => {
    const font = layoutFont({ kern: [[a, b, -40]] });
    expect(shaped(font, "ab").advances).toEqual([460, 500]);
    const run = shaped(font, "a\u0301b");
    expect(run.advances).toEqual([460, 0, 500]);
    expect(run.xOffsets).toEqual([0, -100, 0]);
    expect(shaped(font, "ab", { kerning: false }).advances).toEqual([500, 500]);
  });
});
