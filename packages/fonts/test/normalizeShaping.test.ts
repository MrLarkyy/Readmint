import { expect, test } from "vitest";
import { normalizeForFont, shapeText, type SfntFont } from "../src/index.js";
import { buildTestFont } from "./buildTestFont.js";
import { noto, parse } from "./testFonts.js";

const square = [
  [
    [0, 0, true],
    [400, 0, true],
    [400, 500, true],
    [0, 500, true],
  ],
] as const;

function fontWith(...codePoints: number[]): SfntFont {
  return parse(
    buildTestFont({
      family: "Normalization Test",
      glyphs: [
        { advance: 500 },
        ...codePoints.map((codePoint) => ({
          codePoints: [codePoint],
          advance: codePoint >= 0x300 && codePoint < 0x370 ? 0 : 450 + (codePoint % 7),
          contours: square,
        })),
      ],
    }),
  );
}

const precomposedOnly = fontWith(0x28, 0x29, 0x61, 0x62, 0x65, 0xe9);
const decomposedOnly = fontWith(0x28, 0x29, 0x61, 0x62, 0x65, 0x301);
const both = fontWith(0x28, 0x29, 0x61, 0x62, 0x65, 0xe9, 0x301);

test("U+00E9 and e U+0301 shape alike in a font with either form or both", () => {
  for (const font of [precomposedOnly, decomposedOnly, both]) {
    for (const rtl of [false, true]) {
      const precomposed = shapeText(font, "a\u00e9b\u00e9", { rtl });
      const decomposed = shapeText(font, "ae\u0301be\u0301", { rtl });
      expect(decomposed.glyphs).toEqual(precomposed.glyphs);
      expect(decomposed.advances).toEqual(precomposed.advances);
      expect(decomposed.xOffsets).toEqual(precomposed.xOffsets);
      expect(decomposed.yOffsets).toEqual(precomposed.yOffsets);
      expect(decomposed.marks).toEqual(precomposed.marks);
      expect(decomposed.glyphs).not.toContain(0);
    }
  }
});

test("clusters keep their source offsets, so both forms map back to the same cluster starts", () => {
  const precomposed = shapeText(decomposedOnly, "\u00e9e");
  expect(precomposed.clusters).toEqual([0, 0, 1]);
  const decomposed = shapeText(precomposedOnly, "e\u0301e");
  expect(decomposed.clusters).toEqual([0, 2]);
});

test("normalizeForFont gives the characters the font maps", () => {
  expect(normalizeForFont(precomposedOnly, "e\u0301")).toBe("\u00e9");
  expect(normalizeForFont(decomposedOnly, "\u00e9")).toBe("e\u0301");
  expect(normalizeForFont(both, "e\u0301")).toBe("\u00e9");
  expect(normalizeForFont(both, "\u212b")).toBe("A\u030a");
});

test("a right-to-left run with a bracket and a decomposed mark still mirrors the bracket", () => {
  const close = decomposedOnly.glyphFor(0x29);
  const run = shapeText(decomposedOnly, "(\u00e9", { rtl: true });
  expect(run.glyphs).toEqual([
    decomposedOnly.glyphFor(0x301),
    decomposedOnly.glyphFor(0x65),
    close,
  ]);
});

test("conjoining jamo recompose into the syllable a font maps", () => {
  // Composition is pairwise (L + V, then LV + T), as in HarfBuzz: the font needs the LV syllable too.
  const hangul = fontWith(0x1100, 0x1161, 0x11a8, 0xac00, 0xac01);
  const run = shapeText(hangul, "\u1100\u1161\u11a8\u1100");
  expect(run.glyphs).toEqual([hangul.glyphFor(0xac01), hangul.glyphFor(0x1100)]);
  expect(run.clusters).toEqual([0, 3]);
  const jamo = fontWith(0x1100, 0x1161, 0x11a8);
  expect(shapeText(jamo, "\uac01").glyphs).toEqual(
    [0x1100, 0x1161, 0x11a8].map((c) => jamo.glyphFor(c)),
  );
  const open = fontWith(0x1100, 0x1161, 0x11a8, 0xac00);
  expect(shapeText(open, "\uac01").glyphs).toEqual([0xac00, 0x11a8].map((c) => open.glyphFor(c)));
});

test("a font with only the precomposed syllable draws it for every spelling", () => {
  const syllable = fontWith(0xac01);
  for (const text of ["\uac01", "\u1100\u1161\u11a8", "\uac00\u11a8"]) {
    const run = shapeText(syllable, text);
    expect(run.glyphs).toEqual([syllable.glyphFor(0xac01)]);
    expect(run.clusters).toEqual([0]);
  }
});

test("Arabic modifier marks shape nearest the base for every equivalent spelling", () => {
  const naskh = parse(noto.arabicMarks);
  const [hamza, fatha] = [0x654, 0x64e].map((codePoint) => naskh.glyphFor(codePoint));
  expect([hamza, fatha]).not.toContain(0);
  for (const [text, twin] of [
    ["\u0628\u064e\u0654", "\u0628\u0654\u064e"],
    ["\u0627\u0654\u0653", "\u0623\u0653"],
    ["\u0627\u0653\u0654", "\u0622\u0654"],
  ] as const) {
    const run = shapeText(naskh, text, { rtl: true });
    const other = shapeText(naskh, twin, { rtl: true });
    expect(other.glyphs).toEqual(run.glyphs);
    expect(other.advances).toEqual(run.advances);
    expect(other.xOffsets).toEqual(run.xOffsets);
    expect(other.yOffsets).toEqual(run.yOffsets);
    expect(other.glyphs).not.toContain(0);
  }
  const glyphs = shapeText(naskh, "\u0628\u064e\u0654").glyphs;
  expect(glyphs.indexOf(hamza ?? 0)).toBeGreaterThan(0);
  expect(glyphs.indexOf(hamza ?? 0)).toBeLessThan(glyphs.indexOf(fatha ?? 0));
  expect(normalizeForFont(naskh, "\u0628\u064e\u0654")).toBe("\u0628\u0654\u064e");
  expect(normalizeForFont(naskh, "\u0627\u0654\u0653")).toBe("\u0623\u0653");
  expect(normalizeForFont(naskh, "\u0627\u0653\u0654")).toBe("\u0622\u0654");
});

test("marks on a tatweel in an Arabic run move like those on a letter", () => {
  const naskh = parse(noto.arabicMarks);
  const [hamza, fatha] = [0x654, 0x64e].map((codePoint) => naskh.glyphFor(codePoint));
  const glyphs = shapeText(naskh, String.fromCodePoint(0x628, 0x640, 0x64e, 0x654)).glyphs;
  expect(glyphs).not.toContain(0);
  expect(glyphs.indexOf(hamza ?? 0)).toBeGreaterThan(0);
  expect(glyphs.indexOf(hamza ?? 0)).toBeLessThan(glyphs.indexOf(fatha ?? 0));
});
