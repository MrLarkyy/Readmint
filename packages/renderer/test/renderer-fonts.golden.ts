import { defineGoldenSuite } from "@readmint/golden";
import type { Layer } from "@readmint/format";
import { pairFixtures, pairNames, withFsType, type FontPair } from "./fontFixtures.js";
import { renderFixture, type RenderFixture } from "./renderFixture.js";
import { fontAssets, goldenFontsWithSymbols } from "./testAssets.js";

const ink = "#1f2328";

function text(content: string, y: number, extra: Partial<Layer> = {}): Layer {
  return {
    type: "text",
    x: 10,
    y,
    content,
    font: "medium",
    fontSize: 24,
    fill: ink,
    ...extra,
  } as Layer;
}

const withSymbols = { ...fontAssets.medium, fallback: ["symbols"] };

export const fontPairs: readonly FontPair[] = [
  {
    name: "ttf",
    fonts: { medium: fontAssets.medium },
    layers: [text("Readmint fonts", 14)],
  },
  {
    name: "kerning",
    fonts: { medium: fontAssets.medium, flat: { ...fontAssets.medium, kerning: false } },
    height: 90,
    layers: [text("AV To Wa", 8), text("AV To Wa", 48, { font: "flat" })],
  },
  {
    name: "fallback-symbol",
    fonts: { medium: withSymbols, symbols: fontAssets.symbols },
    layers: [text("Star ★ ● \u{1f536}", 14)],
  },
  {
    name: "missing-glyph",
    fonts: { medium: withSymbols, symbols: fontAssets.symbols },
    layers: [text("a漢b ★c", 14)],
  },
  {
    name: "emoji-dropped",
    fonts: { medium: withSymbols, symbols: fontAssets.symbols },
    layers: [
      text(
        "Fun \u{1f377} \u{1f469}\u200d\u{1f4bb} \u{1f1e8}\u{1f1ff} \u{1f44d}\u{1f3fd} \u2764\ufe0f end",
        14,
      ),
    ],
  },
  {
    name: "restricted-fstype",
    fonts: { medium: { ...fontAssets.medium, src: withFsType(fontAssets.medium.src, 0x0002) } },
    layers: [text("Restricted", 14)],
    pathsOnly: true,
  },
  {
    name: "gradient",
    fonts: { bold: fontAssets.extraBold },
    layers: [
      text("Gradient", 6, {
        font: "bold",
        fontSize: 40,
        fill: {
          type: "linear",
          stops: [
            { offset: 0, color: "#8250df" },
            { offset: 1, color: "#e85aad" },
          ],
        },
      }),
    ],
  },
];

export const fontPairNames = pairNames(fontPairs);

export default defineGoldenSuite<RenderFixture>({
  name: "renderer-fonts",
  render: renderFixture,
  fonts: goldenFontsWithSymbols,
  fixtures: pairFixtures(fontPairs),
});
