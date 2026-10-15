import { describe, expect, test } from "vitest";
import { glyfTableOf } from "../src/glyphClosure.js";
import { encodeWoff, MalformedFont, subsetFont, type SfntFont } from "../src/index.js";
import { CffTable } from "../src/CffTable.js";
import { encodeCharstring, writeCff } from "../src/writeCff.js";
import { buildTestFont } from "./buildTestFont.js";
import { montserrat, parse, sameBytes } from "./testFonts.js";

function codePoints(font: SfntFont, text: string): Map<number, number> {
  return new Map(
    Array.from(text, (char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return [codePoint, font.glyphFor(codePoint)] as const;
    }),
  );
}

/** The name record `id` (Windows, UTF-16) of a name table. */
function nameRecord(name: Uint8Array | undefined, id: number): string | undefined {
  if (name === undefined) return undefined;
  const view = new DataView(name.buffer, name.byteOffset, name.byteLength);
  const storage = view.getUint16(4);
  for (let index = 0; index < view.getUint16(2); index++) {
    const record = 6 + index * 12;
    if (view.getUint16(record) !== 3 || view.getUint16(record + 6) !== id) continue;
    const start = storage + view.getUint16(record + 10);
    let text = "";
    for (let at = 0; at < view.getUint16(record + 8); at += 2) {
      text += String.fromCharCode(view.getUint16(start + at));
    }
    return text;
  }
  return undefined;
}

describe.each([
  ["TTF", montserrat.ttf],
  ["OTF", montserrat.otf],
])("subsetting Montserrat %s", (_name, bytes) => {
  const source = parse(bytes);
  const text = "Readmint AV fonts éÁ";
  const map = codePoints(source, text);
  const subset = parse(subsetFont(source, map));

  test("the subset re-parses with the same flavour and maps exactly the given code points", () => {
    expect(subset.outlines).toBe(source.outlines);
    for (let codePoint = 0; codePoint < 0x10000; codePoint++) {
      expect(subset.glyphFor(codePoint) !== 0, String(codePoint)).toBe(map.has(codePoint));
    }
  });

  test("advances and outlines are those of the source", () => {
    for (const codePoint of map.keys()) {
      const original = source.glyphFor(codePoint);
      const kept = subset.glyphFor(codePoint);
      expect(subset.advanceOf(kept)).toBe(source.advanceOf(original));
      expect(subset.outline(kept)).toEqual(source.outline(original));
    }
    expect(subset.unitsPerEm).toBe(source.unitsPerEm);
    expect(subset.ascender).toBe(source.ascender);
  });

  test("fsType, the copyright and the licence travel with the subset", () => {
    expect(subset.fsType).toBe(source.fsType);
    expect(subset.familyName).toBe(source.familyName);
    expect(nameRecord(subset.table("name"), 0)).toBe(nameRecord(source.table("name"), 0));
    expect(nameRecord(subset.table("name"), 13)).toBe(nameRecord(source.table("name"), 13));
    expect(nameRecord(subset.table("name"), 0)).toContain("Montserrat Project Authors");
  });

  test("no shaping, kerning or hinting tables are left", () => {
    for (const tag of [
      "GSUB",
      "GPOS",
      "GDEF",
      "kern",
      "fpgm",
      "prep",
      "cvt ",
      "gasp",
      "DSIG",
      "STAT",
    ]) {
      expect(subset.table(tag), tag).toBeUndefined();
    }
    expect(subset.kerning(subset.glyphFor(0x41), subset.glyphFor(0x56))).toBe(0);
  });

  test("the same code points give the same bytes, in any order and any number of times", () => {
    const first = subsetFont(source, map);
    const reversed = new Map([...map].reverse());
    expect(sameBytes(subsetFont(source, reversed), first)).toBe(true);
    const repeated = codePoints(source, text.repeat(10));
    expect(sameBytes(subsetFont(source, repeated), first)).toBe(true);
    expect(sameBytes(encodeWoff(subsetFont(source, map)), encodeWoff(first))).toBe(true);
  });

  test("five glyphs take less than a tenth of the font", () => {
    const small = subsetFont(source, codePoints(source, "abcde"));
    expect(small.length).toBeLessThan(bytes.length / 10);
    expect(encodeWoff(small).length).toBeLessThan(small.length);
  });
});

describe("subsetting composites", () => {
  test("a composite glyph keeps its components, renumbered", () => {
    const font = parse(
      buildTestFont({
        family: "C",
        glyphs: [
          { advance: 500 },
          {
            codePoints: [0x61],
            advance: 300,
            contours: [
              [
                [0, 0, true],
                [0, 50, true],
                [50, 0, true],
              ],
            ],
          },
          {
            codePoints: [0x62],
            advance: 300,
            contours: [
              [
                [0, 0, true],
                [0, 80, true],
                [80, 0, true],
              ],
            ],
          },
          { codePoints: [0x63], advance: 300, components: [{ glyph: 2, dx: 10, dy: 20 }] },
        ],
      }),
    );
    const subset = parse(subsetFont(font, new Map([[0x63, 3]])));
    expect(subset.numGlyphs).toBe(3);
    expect(subset.glyphFor(0x62)).toBe(0);
    expect(subset.outline(subset.glyphFor(0x63))).toEqual(font.outline(3));
  });

  test("a character above the BMP gets a format 12 cmap", () => {
    const font = parse(
      buildTestFont({
        family: "C",
        glyphs: [
          { advance: 500 },
          {
            codePoints: [0x1f536],
            advance: 300,
            contours: [
              [
                [0, 0, true],
                [0, 50, true],
                [50, 0, true],
              ],
            ],
          },
        ],
      }),
    );
    const subset = parse(subsetFont(font, new Map([[0x1f536, 1]])));
    expect(subset.glyphFor(0x1f536)).toBe(1);
  });
});

describe("flattened CFF", () => {
  test("the font name keeps only characters browsers accept", () => {
    const outline = [
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 10.5, y: 0 },
      { type: "C", x1: 10, y1: 5, x2: 5, y2: 10, x: 0, y: 10 },
      { type: "Z" },
    ] as const;
    const cff = new CffTable(
      writeCff("My Font (Beta)/2", [encodeCharstring([], 500), encodeCharstring(outline, 600)]),
      1000,
    );
    expect(cff.fontName).toBe("My_Font__Beta__2");
    expect(cff.glyphCount).toBe(2);
    expect(cff.outline(1)).toEqual(outline);
    expect(new CffTable(writeCff("", [encodeCharstring([], 0)]), 1000).fontName).toBe("Subset");
  });
});

test("a glyph whose header promises more contours than it holds is MalformedFont (review probe 3)", () => {
  const bytes = montserrat.ttf.slice();
  const font = parse(bytes);
  const glyph = font.glyphFor(0x42);
  const data = glyfTableOf(font).data(glyph);
  new DataView(data.buffer, data.byteOffset).setInt16(0, Math.floor(data.length / 2) + 10);
  expect(() => subsetFont(font, new Map([[0x42, glyph]]))).toThrow(MalformedFont);
  expect(() => font.outline(glyph)).toThrow(MalformedFont);
});
