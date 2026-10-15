import { describe, expect, test } from "vitest";
import { shapeText } from "../src/index.js";
import { montserrat, noto, parse } from "./testFonts.js";

const medium = parse(montserrat.ttf);
const naskh = parse(noto.arabic);
const devanagari = parse(noto.devanagari);

// Glyph ids by name (fontTools glyph order) in the committed fonts.
const latin = { o: 521, f: 460, i: 475, fi: 730, fl: 731, c: 420, e: 434, A: 1, V: 220 };
const arabic = {
  alef: 3,
  lamInit: 53,
  ainMedi: 35,
  rehFina: 20,
  dotlessBehInit: 11,
  dotlessBehMediWide: 10,
  hehFina: 64,
  dotBelow: 138,
  twoDotsBelow: 139,
  twoDotsAbove: 127,
  lamInitRlig: 54,
  alefFinaRlig: 5,
};
const deva = {
  iMatra03: 232,
  iMatra04: 233,
  ha: 50,
  nHalf: 85,
  da: 40,
  iiMatra: 23,
  kSsa: 51,
  ka: 36,
  reph: 204,
};

describe("shapeText", () => {
  test("Montserrat: fi and fl become one ligature glyph each, in the cluster of their first letter", () => {
    const run = shapeText(medium, "office flow");
    expect(run.glyphs.slice(0, 5)).toEqual([latin.o, latin.f, latin.fi, latin.c, latin.e]);
    expect(run.clusters.slice(0, 5)).toEqual([0, 1, 2, 4, 5]);
    expect(run.glyphs[6]).toBe(latin.fl);
  });

  test("ligatures false keeps f and i apart", () => {
    expect(shapeText(medium, "fi", { ligatures: false }).glyphs).toEqual([latin.f, latin.i]);
  });

  test("Montserrat kerns AV through GPOS; kerning false does not", () => {
    const advance = medium.advanceOf(latin.A);
    expect(shapeText(medium, "AV").advances[0]).toBeLessThan(advance);
    expect(shapeText(medium, "AV", { kerning: false }).advances[0]).toBe(advance);
  });

  test("Noto Naskh Arabic: an Arabic word takes its joining forms, in visual order", () => {
    // U+0627 U+0644 U+0639 U+0631 U+0628 U+064A U+0629: alef, lam, ain, reh, beh, yeh, teh marbuta.
    const run = shapeText(naskh, "\u0627\u0644\u0639\u0631\u0628\u064a\u0629", { rtl: true });
    const bases = run.glyphs.filter((_, index) => run.marks[index] !== true);
    expect(bases).toEqual([
      arabic.hehFina,
      arabic.dotlessBehMediWide,
      arabic.dotlessBehInit,
      arabic.rehFina,
      arabic.ainMedi,
      arabic.lamInit,
      arabic.alef,
    ]);
    expect(run.glyphs).toContain(arabic.twoDotsAbove);
    expect(run.clusters[run.clusters.length - 1]).toBe(0);
    expect(run.rtl).toBe(true);
  });

  test("Noto Naskh Arabic: marks attach above and below their letters", () => {
    // U+0628 U+0650 U+0633 U+0652 U+0645 U+0650: beh kasra, seen sukun, meem kasra.
    const run = shapeText(naskh, "\u0628\u0650\u0633\u0652\u0645\u0650", { rtl: true });
    const marks = run.glyphs.flatMap((glyph, index) =>
      run.marks[index] === true ? [{ glyph, y: run.yOffsets[index] ?? 0 }] : [],
    );
    expect(marks.length).toBe(4);
    for (const mark of marks) expect(mark.y).not.toBe(0);
    for (let index = 0; index < run.glyphs.length; index++) {
      if (run.marks[index] === true) expect(run.advances[index]).toBe(0);
    }
  });

  test("Noto Naskh Arabic: lam alef is required (rlig)", () => {
    expect(shapeText(naskh, "\u0644\u0627", { rtl: true }).glyphs).toEqual([
      arabic.alefFinaRlig,
      arabic.lamInitRlig,
    ]);
  });

  test("Noto Sans Devanagari: the i matra moves before its consonant cluster, half forms form", () => {
    // U+0939 U+093F U+0928 U+094D U+0926 U+0940: hindi.
    const run = shapeText(devanagari, "\u0939\u093f\u0928\u094d\u0926\u0940");
    expect(run.glyphs).toEqual([deva.iMatra03, deva.ha, deva.nHalf, deva.da, deva.iiMatra]);
    expect(run.clusters).toEqual([0, 0, 2, 2, 2]);
  });

  test("Noto Sans Devanagari: a conjunct, a reph after its consonant, a short i before it", () => {
    expect(shapeText(devanagari, "\u0915\u094d\u0937").glyphs).toEqual([deva.kSsa]);
    const reph = shapeText(devanagari, "\u0930\u094d\u0915");
    expect(reph.glyphs).toEqual([deva.ka, deva.reph]);
    expect(reph.clusters).toEqual([0, 0]);
    expect(shapeText(devanagari, "\u0915\u093f").glyphs).toEqual([deva.iMatra04, deva.ka]);
  });

  test("a matra without a consonant gets the font's dotted circle", () => {
    const run = shapeText(devanagari, "\u093f");
    expect(run.glyphs[1]).toBe(devanagari.glyphFor(0x25cc));
  });

  test("default ignorables shape but are not drawn", () => {
    expect(shapeText(medium, "a\u200db\u2067c\u2069").glyphs).toEqual(
      shapeText(medium, "abc").glyphs,
    );
    expect(shapeText(medium, "\u200d\u200c\u200f").glyphs).toEqual([]);
  });

  test("the same text shapes to the same run every time", () => {
    const text = "\u0627\u0644\u0639\u0631\u0628\u064a\u0629";
    expect(shapeText(naskh, text, { rtl: true })).toEqual(shapeText(naskh, text, { rtl: true }));
  });

  test("a mirrored character in a right-to-left run takes its mirror glyph", () => {
    const run = shapeText(medium, "(a)", { rtl: true });
    expect(run.glyphs).toEqual([
      medium.glyphFor(0x28),
      medium.glyphFor(0x61),
      medium.glyphFor(0x29),
    ]);
  });
});
