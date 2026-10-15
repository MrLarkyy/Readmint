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
