import { describe, expect, test } from "vitest";
import { loadScale } from "../../../test-support/loadScale.js";
import { MalformedFont } from "../src/index.js";
import { readTableDirectory } from "../src/readTableDirectory.js";
import { SfntReader } from "../src/SfntReader.js";
import { TRUETYPE_FLAVOR } from "../src/sfntFlavor.js";
import { writeSfnt } from "../src/writeSfnt.js";
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

/** Montserrat with its GPOS replaced. */
function withGpos(gpos: Uint8Array): Uint8Array {
  const reader = new SfntReader(montserrat.ttf);
  const tables = new Map<string, Uint8Array>();
  for (const [tag, table] of readTableDirectory(reader)) {
    tables.set(tag, reader.slice(table.offset, table.length));
  }
  tables.set("GPOS", gpos);
  return writeSfnt(TRUETYPE_FLAVOR, tables, true);
}

/**
 * Review probes 4 and 5: one kern feature listed `count` times by the DFLT LangSys, whose lookup list names lookup
 * 0 `count` times; the old reader read count x count entries.
 */
function repeatedKernFeature(count: number): Uint8Array {
  const lookupList = 10;
  const lookup = 14;
  const scriptList = 20;
  const script = 28;
  const featureList = 32;
  const feature = 40;
  const langSys = feature + 4 + count * 2;
  const bytes = new Uint8Array(langSys + 6 + count * 2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 1);
  view.setUint16(4, scriptList);
  view.setUint16(6, featureList);
  view.setUint16(8, lookupList);
  view.setUint16(lookupList, 1);
  view.setUint16(lookupList + 2, lookup - lookupList);
  view.setUint16(lookup, 2);
  view.setUint16(scriptList, 1);
  bytes.set([0x44, 0x46, 0x4c, 0x54], scriptList + 2);
  view.setUint16(scriptList + 6, script - scriptList);
  view.setUint16(script, langSys - script);
  view.setUint16(featureList, 1);
  bytes.set([0x6b, 0x65, 0x72, 0x6e], featureList + 2);
  view.setUint16(featureList + 6, feature - featureList);
  view.setUint16(langSys + 2, 0xffff);
  view.setUint16(langSys + 4, count);
  view.setUint16(feature + 2, count);
  return bytes;
}

/** A ceiling for work that must stay linear: it answers in about a millisecond; the quadratic reader took seconds. */
const ceilingMs = 1000;

describe("crafted kern features cost work linear in the table", () => {
  const answer = (count: number) => {
    const font = parse(withGpos(repeatedKernFeature(count)));
    const started = performance.now();
    let value: number | MalformedFont;
    try {
      value = font.kerning(font.glyphFor(0x41), font.glyphFor(0x56));
    } catch (error) {
      if (!(error instanceof MalformedFont)) throw error;
      value = error;
    }
    return { value, ms: performance.now() - started };
  };

  test("a feature listed 4000 times with 4000 lookup entries answers at once", () => {
    const { value, ms } = answer(4000);
    expect(value).toBe(0);
    expect(ms).toBeLessThan(ceilingMs * loadScale());
  });

  test("32000 entries each are refused before they are read (the quadratic reader read 10^9 and answered 0)", () => {
    const { value, ms } = answer(32_000);
    expect(value).toBeInstanceOf(MalformedFont);
    expect(ms).toBeLessThan(ceilingMs * loadScale());
  });
});
