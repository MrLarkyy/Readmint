import type { FontAsset } from "@readmint/format";
import gradientJpeg from "./assets/gradient.jpg?inline";
import patternPng from "./assets/pattern.png?inline";
import tallWebp from "./assets/tall.webp?inline";
import twoFramesGif from "./assets/two-frames.gif?inline";
import montserratExtraBold from "./fonts/Montserrat-ExtraBold.ttf?inline";
import montserratMediumOtf from "./fonts/Montserrat-Medium.otf?inline";
import montserratMedium from "./fonts/Montserrat-Medium.ttf?inline";
import montserratMediumWoff from "./fonts/Montserrat-Medium.woff?inline";
import montserratMediumWoff2 from "./fonts/Montserrat-Medium.woff2?inline";
import readmintTestSymbols from "./fonts/ReadmintTestSymbols.ttf?inline";

const ofl = { embedding: "allowed", name: "OFL-1.1" } as const;

/**
 * Montserrat (OFL-1.1, fsType 0, typographic family "Montserrat"): 8.000 as TTF, 7.222 as OTF, WOFF and WOFF2;
 * the repository's own Readmint Test Symbols. See fonts/README.md.
 */
export const fontAssets = {
  medium: { family: "Montserrat", src: montserratMedium, weight: 500, licence: ofl },
  extraBold: { family: "Montserrat", src: montserratExtraBold, weight: 800, licence: ofl },
  otf: { family: "Montserrat", src: montserratMediumOtf, weight: 500, licence: ofl },
  woff: { family: "Montserrat", src: montserratMediumWoff, weight: 500, licence: ofl },
  woff2: { family: "Montserrat", src: montserratMediumWoff2, weight: 500, licence: ofl },
  symbols: {
    family: "Readmint Test Symbols",
    src: readmintTestSymbols,
    licence: { embedding: "allowed" },
  },
} satisfies Record<string, FontAsset>;

/** The same fonts for resvg, which matches `font-family` against the family inside the files. */
export const goldenFonts = [
  "packages/renderer/test/fonts/Montserrat-Medium.ttf",
  "packages/renderer/test/fonts/Montserrat-ExtraBold.ttf",
];

/** Montserrat 8.000 and the test symbols: what resvg draws the font fixtures with. */
export const goldenFontsWithSymbols = [
  ...goldenFonts,
  "packages/renderer/test/fonts/ReadmintTestSymbols.ttf",
];

/**
 * Montserrat 7.222 Medium: resvg reads no WOFF or WOFF2, so the fixtures of those containers (and of the OTF) are
 * drawn by resvg from the OTF of the same release, which has the same metrics and design.
 */
export const goldenFontsV7 = ["packages/renderer/test/fonts/Montserrat-Medium.otf"];

/** Own-made images: PNG 24x16, JPEG 32x16, WebP 16x32, GIF 16x16 with two frames. */
export const imageAssets = {
  png: { src: patternPng },
  jpeg: { src: gradientJpeg },
  webp: { src: tallWebp },
  gif: { src: twoFramesGif },
};
