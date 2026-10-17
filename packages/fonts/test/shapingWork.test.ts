import { describe, expect, test } from "vitest";
import { timed } from "../../../test-support/loadScale.js";
import { ByteWriter } from "../src/ByteWriter.js";
import { MalformedFont, ShapingBudget, shapeText, type SfntFont } from "../src/index.js";
import { buildTestFont, type TestGlyph } from "./buildTestFont.js";
import { noto, parse } from "./testFonts.js";

const ceilingMs = 50;
const consonants = Array.from({ length: 37 }, (_, index) => 0x0915 + index);
const virama = 0x094d;

/**
 * Review probe r1: a Devanagari font whose `blwf` feature names one type 4 lookup 1000 times, of 64 subtables each
 * covering every consonant and the virama with ligature sets of 64 entries that never match. The tables share their
 * bytes through offsets, so the font is small while asking whether a consonant takes a below-base form reads
 * 4 million entries.
 */
function probingFont(): SfntFont {
  const glyphs: TestGlyph[] = [
    { advance: 500 },
    ...consonants.map((codePoint) => ({ codePoints: [codePoint], advance: 500 })),
    { codePoints: [virama], advance: 0 },
  ];
  const covered = glyphs.length - 1;
  const out = new ByteWriter();
  const scriptList = 10;
  const featureList = 30;
  const lookupList = featureList + 8 + 4 + 2000;
  const lookup = lookupList + 2 + 2000;
  const subtable = lookup + 6 + 128;
  const coverage = subtable + 6 + 2 * covered;
  const set = coverage + 4 + 2 * covered;
  const ligature = set + 2 + 128;
  out.u32(0x00010000).u16(scriptList).u16(featureList).u16(lookupList);
  out.u16(1).tag("dev2").u16(8).u16(4).u16(0);
  out.u16(0).u16(0xffff).u16(1).u16(0);
  out.u16(1).tag("blwf").u16(8).u16(0).u16(1000);
  for (let index = 0; index < 1000; index++) out.u16(0);
  out.u16(1000);
  for (let index = 0; index < 1000; index++) out.u16(lookup - lookupList);
  out.u16(4).u16(0).u16(64);
  for (let index = 0; index < 64; index++) out.u16(subtable - lookup);
  out
    .u16(1)
    .u16(coverage - subtable)
    .u16(covered);
  for (let index = 0; index < covered; index++) out.u16(set - subtable);
  out.u16(1).u16(covered);
  for (let glyph = 1; glyph <= covered; glyph++) out.u16(glyph);
  out.u16(64);
  for (let index = 0; index < 64; index++) out.u16(ligature - set);
  out.u16(1).u16(2).u16(0);
  return parse(buildTestFont({ family: "Probe", glyphs, tables: { GSUB: out.result() } }));
}

describe("shaping work is bounded across calls", () => {
  test("probing which consonants take below-base forms is charged: a crafted blwf fails within 50 ms", () => {
    const font = probingFont();
    const text = String.fromCharCode(...consonants);
    const { value, ms, scale } = timed(() => {
      try {
        shapeText(font, text, { script: "Deva" });
      } catch (error) {
        return error;
      }
      return undefined;
    });
    expect(value).toBeInstanceOf(MalformedFont);
    expect(ms).toBeLessThan(ceilingMs * scale);
  });

  test("a font's form answers are kept with its plan: the second text pays nothing for them", () => {
    const font = parse(noto.devanagari);
    const text = "क्ष र्क हिन्दी";
    const first = new ShapingBudget(1_000_000);
    shapeText(font, text, { script: "Deva", budget: first });
    const second = new ShapingBudget(1_000_000);
    shapeText(font, text, { script: "Deva", budget: second });
    expect(second.used).toBeLessThan(first.used);
  });

  test("calls sharing one budget fail together once it is spent", () => {
    const font = parse(noto.arabic);
    const budget = new ShapingBudget(20_000);
    const word = (index: number) =>
      String.fromCharCode(0x0628 + (index % 20), 0x0644, 0x0639 + (index % 3), 0x0631);
    expect(() => {
      for (let index = 0; index < 1000; index++) {
        shapeText(font, word(index), { rtl: true, budget });
      }
    }).toThrow(MalformedFont);
    expect(budget.used).toBeGreaterThan(20_000);
  });

  test("2000 characters of distinct Arabic words, each word and the line shaped, spend under a quarter of the budget a text gets (two passes)", () => {
    const font = parse(noto.arabic);
    let state = 7;
    const next = () => {
      state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
      return state >>> 8;
    };
    const letters = [
      0x0627, 0x0628, 0x062a, 0x062c, 0x062f, 0x0631, 0x0633, 0x0639, 0x0641, 0x0642,
    ];
    const marks = [0x064e, 0x0650, 0x0651, 0x0652];
    const words: string[] = [];
    let text = "";
    while (text.length < 2000) {
      let word = "";
      for (let letter = 0; letter < 3 + (next() % 5); letter++) {
        word += String.fromCharCode(letters[next() % letters.length] ?? 0x0628);
        if (next() % 3 === 0) word += String.fromCharCode(marks[next() % marks.length] ?? 0x064e);
      }
      words.push(word);
      text += `${word} `;
    }
    const budget = ShapingBudget.forText(2 * text.length);
    for (const word of new Set(words)) shapeText(font, word, { rtl: true, budget });
    shapeText(font, text, { rtl: true, budget });
    expect(budget.used).toBeLessThan(budget.maxOperations / 4);
  });
});
