import { expect, test } from "vitest";
import { normalizeForFont, shapeText, type SfntFont } from "../src/index.js";
import { buildTestFont } from "./buildTestFont.js";
import { parse } from "./testFonts.js";

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
