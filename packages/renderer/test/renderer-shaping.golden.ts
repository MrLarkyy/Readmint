import { defineGoldenSuite } from "@readmint/golden";
import type { Layer } from "@readmint/format";
import { embeddedFonts } from "./embeddedFonts.js";
import { pairFixtures, pairNames, type FontPair } from "./fontFixtures.js";
import { renderFixture, type RenderFixture } from "./renderFixture.js";
import { fontAssets } from "./testAssets.js";

const ink = "#1f2328";

function text(content: string, font: string, extra: Partial<Layer> = {}): Layer {
  return { type: "text", x: 10, y: 8, content, font, fontSize: 26, fill: ink, ...extra } as Layer;
}

/** U+0627 U+0644 U+0639 U+0631 U+0628 U+064A U+0629: Arabic, every joining form. */
const arabicWord = "\u0627\u0644\u0639\u0631\u0628\u064a\u0629";

/**
 * U+0628 U+064E U+0654, U+0628 U+0650 U+0655, U+0627 U+0653 U+0654 (beh fatha hamza above, beh kasra hamza below,
 * alef maddah hamza above): the hamzas, modifier marks, stack nearest the beh before the fatha and the kasra (UAX #53);
 * behind the maddah that leads the class 230 marks, the hamza stays on top (U+0622 U+0654).
 */
export const arabicModifierMarks = "\u0628\u064e\u0654 \u0628\u0650\u0655 \u0627\u0653\u0654";

/** Spellings canonically equivalent to `arabicModifierMarks`, the marks of different classes in other orders. */
export const arabicModifierMarkSpellings = [
  "\u0628\u0654\u064e \u0628\u0655\u0650 \u0622\u0654",
  "\u0628\u064e\u0654 \u0628\u0655\u0650 \u0627\u0653\u0654",
];

/**
 * Texts written decomposed (one Vietnamese mark pair out of canonical order) and the same texts precomposed: each
 * decomposed pair must render to exactly the SVG of its precomposed twin.
 */
export const decomposedTwins: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  "latin-decomposed": [
    ["Cafe\u0301 nai\u0308ve", "Caf\u00e9 na\u00efve"],
    ["A\u030angstro\u0308m", "\u00c5ngstr\u00f6m"],
  ],
  "vietnamese-decomposed": [
    ["Tie\u0302\u0301ng Vie\u0302\u0323t", "Ti\u1ebfng Vi\u1ec7t"],
    ["co\u031b\u0300, chu\u031b\u0303", "c\u1edd, ch\u1eef"],
  ],
};

/** The layers of a twin pair: one text per line, decomposed or precomposed. */
export function twinLayers(name: string, form: 0 | 1): Layer[] {
  return (decomposedTwins[name] ?? []).map((texts, index) =>
    text(texts[form], "medium", { y: 8 + index * 34 }),
  );
}

/** Montserrat with Noto Naskh Arabic as its fallback, for mixed Latin and Arabic text. */
const mixed = { ...fontAssets.medium, fallback: ["naskh"] };

export const shapingPairs: readonly FontPair[] = [
  {
    name: "latin-liga",
    fonts: { medium: fontAssets.medium },
    layers: [text("office fit flow", "medium")],
  },
  {
    name: "arabic-word",
    fonts: { naskh: fontAssets.naskh },
    height: 70,
    layers: [text(arabicWord, "naskh")],
  },
  {
    name: "arabic-marks",
    fonts: { naskh: fontAssets.naskh },
    height: 70,
    // U+0628 U+0650 U+0633 U+0652 U+0645 U+0650: beh kasra, seen sukun, meem kasra.
    layers: [text("\u0628\u0650\u0633\u0652\u0645\u0650", "naskh", { fontSize: 32 })],
  },
  {
    name: "arabic-modifier-marks",
    fonts: { naskhMarks: fontAssets.naskhMarks },
    height: 70,
    layers: [text(arabicModifierMarks, "naskhMarks", { fontSize: 32 })],
  },
  {
    name: "arabic-lam-alef",
    fonts: { naskh: fontAssets.naskh },
    height: 70,
    layers: [text("\u0644\u0627 \u0644\u0627", "naskh", { fontSize: 32 })],
  },
  {
    name: "devanagari",
    fonts: { devanagari: fontAssets.devanagari },
    height: 64,
    // hindi; ka-ssa conjunct; reph on ka; ka with the short i before it.
    layers: [
      text(
        "\u0939\u093f\u0928\u094d\u0926\u0940 \u0915\u094d\u0937 \u0930\u094d\u0915 \u0915\u093f",
        "devanagari",
        { fontSize: 24 },
      ),
    ],
  },
  {
    name: "bidi-mixed",
    fonts: { medium: mixed, naskh: fontAssets.naskh },
    height: 64,
    layers: [text(`Readmint 2.0 ${arabicWord} (v1)`, "medium", { fontSize: 18 })],
  },
  {
    name: "arabic-wrapped",
    fonts: { naskh: fontAssets.naskh },
    height: 200,
    layers: [
      text(`${arabicWord} ${arabicWord} ${arabicWord}`, "naskh", { width: 150, fontSize: 24 }),
      text(`${arabicWord} ${arabicWord} ${arabicWord}`, "naskh", {
        y: 100,
        width: 150,
        fontSize: 24,
        align: "end",
      }),
    ],
  },
  {
    name: "space-variants",
    fonts: { medium: fontAssets.medium, devanagari: fontAssets.devanagari },
    height: 110,
    layers: [
      // Em, en, third, sixth, narrow and ideographic spaces, none of them in Montserrat.
      text("1\u2003" + "2\u20023\u20044\u20065\u202f6\u30007", "medium", { fontSize: 24, y: 6 }),
      // U+2011 takes the U+2010 glyph; U+2009 is Montserrat's own.
      text("non\u2011breaking 2\u20093", "medium", { fontSize: 24, y: 40 }),
      // The font has no U+2010: U+2011 takes the hyphen-minus glyph.
      text("\u0939\u2011\u0915", "devanagari", { fontSize: 24, y: 74 }),
    ],
  },
  ...Object.keys(decomposedTwins).map((name) => ({
    name,
    fonts: { medium: fontAssets.medium },
    height: 80,
    layers: twinLayers(name, 0),
  })),
];

export const shapingPairNames = pairNames(shapingPairs);

/**
 * Complex-script shaping drawn with the embedded subsets and as paths: resvg draws the font fixtures from the
 * subsets inside each SVG, because shaped glyphs are written as private-use characters only those map.
 */
export default defineGoldenSuite<RenderFixture>({
  name: "renderer-shaping",
  render: renderFixture,
  fontsFromSvg: embeddedFonts,
  // Joined scripts overlap their glyphs (Arabic connections, the Devanagari headline, marks on bases): Chromium
  // antialiases each glyph of a text on its own but a path as one shape, so the seams differ by some 1.5% of the
  // pixels. resvg draws both alike, and the Node cross test holds them to zero differing pixels.
  browserTolerance: { maxDiffRatio: 0.02 },
  fixtures: pairFixtures(shapingPairs),
});
