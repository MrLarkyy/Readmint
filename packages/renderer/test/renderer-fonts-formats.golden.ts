import { defineGoldenSuite } from "@readmint/golden";
import type { Layer } from "@readmint/format";
import { pairFixtures, pairNames, type FontPair } from "./fontFixtures.js";
import { renderFixture, type RenderFixture } from "./renderFixture.js";
import { fontAssets, goldenFontsV7 } from "./testAssets.js";

const layers: Layer[] = [
  {
    type: "text",
    x: 10,
    y: 14,
    content: "Readmint AV fonts",
    font: "m",
    fontSize: 24,
    fill: "#1f2328",
  },
];

/** The containers of Montserrat 7.222: each drawn with its subset and as paths from its own outlines. */
export const formatPairs: readonly FontPair[] = [
  { name: "otf", fonts: { m: fontAssets.otf }, layers },
  { name: "woff", fonts: { m: fontAssets.woff }, layers },
  { name: "woff2", fonts: { m: fontAssets.woff2 }, layers },
];

export const formatPairNames = pairNames(formatPairs);

export default defineGoldenSuite<RenderFixture>({
  name: "renderer-fonts-formats",
  render: renderFixture,
  fonts: goldenFontsV7,
  fixtures: pairFixtures(formatPairs),
});
