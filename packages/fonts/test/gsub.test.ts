import { describe, expect, test } from "vitest";
import {
  classDef,
  coverage,
  extension,
  list,
  struct,
  type TestLookup,
} from "./buildLayoutTables.js";
import { glyph, glyphsOf, layoutFont, shaped } from "./layoutFont.js";

const { a, b, c, d, acute, x, out1, out2, out3, ligatureAb, ligatureAbc } = glyph;

/** A font whose feature `tag` (ccmp unless given) applies lookup 0; further lookups are only called. */
function fontWith(lookups: readonly TestLookup[], tag = "ccmp") {
  return layoutFont({ gsub: { features: [{ tag, lookups: [0] }], lookups } });
}

const singleAToX: TestLookup = {
  type: 1,
  subtables: [struct([1, { offset: coverage([a]) }, { i16: x - a }])],
};
const singleBToOut3: TestLookup = {
  type: 1,
  subtables: [struct([2, { offset: coverage([b]) }, ...list([out3])])],
};
const ligatures = (flag = 0): TestLookup => ({
  type: 4,
  flag,
  subtables: [
    struct([
      1,
      { offset: coverage([a]) },
      1,
      {
        offset: struct([
          2,
          { offset: struct([ligatureAbc, 3, b, c]) },
          { offset: struct([ligatureAb, 2, b]) },
        ]),
      },
    ]),
  ],
});

describe("GSUB lookup types", () => {
  test("1 single, format 1 (delta) and format 2 (list)", () => {
    expect(glyphsOf(fontWith([singleAToX]), "ab")).toEqual([x, b]);
    expect(glyphsOf(fontWith([singleBToOut3]), "ab")).toEqual([a, out3]);
  });

  test("2 multiple: one glyph becomes several in its cluster; an empty sequence deletes", () => {
    const font = fontWith([
      {
        type: 2,
        subtables: [
          struct([
            1,
            { offset: coverage([a, b]) },
            2,
            { offset: struct(list([out1, out2, out3])) },
            { offset: struct(list([])) },
          ]),
        ],
      },
    ]);
    const run = shaped(font, "abc");
    expect(run.glyphs).toEqual([out1, out2, out3, c]);
    expect(run.clusters).toEqual([0, 0, 0, 2]);
  });

  test("3 alternate: the first alternate", () => {
    const font = fontWith([
      {
        type: 3,
        subtables: [
          struct([1, { offset: coverage([a]) }, 1, { offset: struct(list([out2, out3])) }]),
        ],
      },
    ]);
    expect(glyphsOf(font, "a")).toEqual([out2]);
  });

  test("4 ligature: the first ligature of the set that matches, one cluster", () => {
    const font = fontWith([ligatures()]);
    expect(glyphsOf(font, "abc")).toEqual([ligatureAbc]);
    const run = shaped(font, "abd");
    expect(run.glyphs).toEqual([ligatureAb, d]);
    expect(run.clusters).toEqual([0, 2]);
  });

  test("4 ligature across a mark only when the lookup ignores marks; the mark stays after the ligature", () => {
    expect(glyphsOf(fontWith([ligatures()]), "áb")).toEqual([a, acute, b]);
    const run = shaped(fontWith([ligatures(0x0008)]), "áb");
    expect(run.glyphs).toEqual([ligatureAb, acute]);
    expect(run.clusters).toEqual([0, 0]);
  });

  test("ZWNJ blocks a ligature, ZWJ does not; neither is drawn", () => {
    const font = fontWith([ligatures()], "liga");
    expect(glyphsOf(font, "a‌b")).toEqual([a, b]);
    expect(glyphsOf(font, "a‍b")).toEqual([ligatureAb]);
    expect(glyphsOf(font, "ab", { ligatures: false })).toEqual([a, b]);
  });

  test("5 context, format 1 (glyphs)", () => {
    const rule = struct([2, 1, b, 0, 1]);
    const font = fontWith([
      {
        type: 5,
        subtables: [
          struct([1, { offset: coverage([a]) }, 1, { offset: struct([1, { offset: rule }]) }]),
        ],
      },
      singleAToX,
    ]);
    expect(glyphsOf(font, "ab")).toEqual([x, b]);
    expect(glyphsOf(font, "ac")).toEqual([a, c]);
  });

  test("5 context, format 2 (classes)", () => {
    const rule = struct([2, 1, 2, 0, 1]);
    const font = fontWith([
      {
        type: 5,
        subtables: [
          struct([
            2,
            { offset: coverage([a]) },
            {
              offset: classDef([
                [a, 1],
                [b, 2],
              ]),
            },
            2,
            { offset: null },
            { offset: struct([1, { offset: rule }]) },
          ]),
        ],
      },
      singleAToX,
    ]);
    expect(glyphsOf(font, "ab")).toEqual([x, b]);
    expect(glyphsOf(font, "aa")).toEqual([a, a]);
  });

  test("5 context, format 3 (coverages), a nested lookup at the second position", () => {
    const font = fontWith([
      {
        type: 5,
        subtables: [struct([3, 2, 1, { offset: coverage([a]) }, { offset: coverage([b]) }, 1, 1])],
      },
      singleBToOut3,
    ]);
    expect(glyphsOf(font, "ab")).toEqual([a, out3]);
  });

  test("nested lookups that change the length move the later match positions", () => {
    // After a becomes two glyphs, sequence index 2 is the b (indices name the sequence as it is now).
    const font = fontWith([
      {
        type: 5,
        subtables: [
          struct([3, 2, 2, { offset: coverage([a]) }, { offset: coverage([b]) }, 0, 1, 2, 2]),
        ],
      },
      {
        type: 2,
        subtables: [
          struct([1, { offset: coverage([a]) }, 1, { offset: struct(list([out1, out2])) }]),
        ],
      },
      singleBToOut3,
    ]);
    expect(glyphsOf(font, "ab")).toEqual([out1, out2, out3]);
  });

  test("6 chained context, formats 1, 2 and 3: backtrack c, input a, lookahead b", () => {
    const format1 = struct([
      1,
      { offset: coverage([a]) },
      1,
      { offset: struct([1, { offset: struct([1, c, 1, 1, b, 1, 0, 1]) }]) },
    ]);
    const format2 = struct([
      2,
      { offset: coverage([a]) },
      { offset: classDef([[c, 1]]) },
      { offset: classDef([[a, 1]]) },
      { offset: classDef([[b, 1]]) },
      2,
      { offset: null },
      { offset: struct([1, { offset: struct([1, 1, 1, 1, 1, 1, 0, 1]) }]) },
    ]);
    const format3 = struct([
      3,
      1,
      { offset: coverage([c]) },
      1,
      { offset: coverage([a]) },
      1,
      { offset: coverage([b]) },
      1,
      0,
      1,
    ]);
    for (const subtable of [format1, format2, format3]) {
      const font = fontWith([{ type: 6, subtables: [subtable] }, singleAToX]);
      expect(glyphsOf(font, "cab")).toEqual([c, x, b]);
      expect(glyphsOf(font, "dab")).toEqual([d, a, b]);
      expect(glyphsOf(font, "cac")).toEqual([c, a, c]);
    }
  });

  test("7 extension", () => {
    const font = fontWith([
      { type: 7, subtables: [extension(1, singleAToX.subtables[0] ?? new Uint8Array())] },
    ]);
    expect(glyphsOf(font, "a")).toEqual([x]);
  });

  test("8 reverse chaining single, applied from the end", () => {
    const font = fontWith([
      {
        type: 8,
        subtables: [
          struct([
            1,
            { offset: coverage([a]) },
            1,
            { offset: coverage([c, a, x]) },
            0,
            ...list([x]),
          ]),
        ],
      },
    ]);
    // Applied from the end: the last a sees c before it; the first sees the (not yet substituted) a... in reverse.
    expect(glyphsOf(font, "caa")).toEqual([c, x, x]);
    expect(glyphsOf(font, "da")).toEqual([d, a]);
  });

  test("a feature naming a lookup past the lookup list is ignored", () => {
    const font = layoutFont({
      gsub: { features: [{ tag: "ccmp", lookups: [0, 7] }], lookups: [singleAToX] },
    });
    expect(glyphsOf(font, "a")).toEqual([x]);
  });
});
