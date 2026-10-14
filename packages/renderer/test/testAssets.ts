import type { FontAsset } from "@readmint/format";
import gradientJpeg from "./assets/gradient.jpg?inline";
import patternPng from "./assets/pattern.png?inline";
import tallWebp from "./assets/tall.webp?inline";
import twoFramesGif from "./assets/two-frames.gif?inline";
import montserratExtraBold from "./fonts/Montserrat-ExtraBold.ttf?inline";
import montserratMedium from "./fonts/Montserrat-Medium.ttf?inline";

/** Montserrat (OFL-1.1, fsType 0, typographic family "Montserrat"); see fonts/OFL.txt. */
export const fontAssets = {
  medium: {
    family: "Montserrat",
    src: montserratMedium,
    weight: 500,
    licence: { embedding: "allowed", name: "OFL-1.1" },
  },
  extraBold: {
    family: "Montserrat",
    src: montserratExtraBold,
    weight: 800,
    licence: { embedding: "allowed", name: "OFL-1.1" },
  },
} satisfies Record<string, FontAsset>;

/** The same fonts for resvg, which matches `font-family` against the family inside the files. */
export const goldenFonts = [
  "packages/renderer/test/fonts/Montserrat-Medium.ttf",
  "packages/renderer/test/fonts/Montserrat-ExtraBold.ttf",
];

/** Own-made images: PNG 24x16, JPEG 32x16, WebP 16x32, GIF 16x16 with two frames. */
export const imageAssets = {
  png: { src: patternPng },
  jpeg: { src: gradientJpeg },
  webp: { src: tallWebp },
  gif: { src: twoFramesGif },
};
