import gradientJpg from "../../renderer/test/assets/gradient.jpg?inline";
import patternPng from "../../renderer/test/assets/pattern.png?inline";
import tallWebp from "../../renderer/test/assets/tall.webp?inline";
import twoFramesGif from "../../renderer/test/assets/two-frames.gif?inline";
import { jpegWithExif, orientationTiff, pngChunk } from "../../renderer/test/exifImages.js";
import { dataUriBytes } from "./testFonts.js";

const concat = (...parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

const u32be = (value: number): Uint8Array =>
  new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);

const png = dataUriBytes(patternPng);
const jpeg = dataUriBytes(gradientJpg);
/** Where the PNG signature and IHDR chunk end. */
const ihdrEnd = 33;

/** `png` declaring `width` x `height` in its IHDR, the rest unchanged. */
function resizedPng(width: number, height: number): Uint8Array {
  const header = png.slice(16, 29);
  header.set(u32be(width), 0);
  header.set(u32be(height), 4);
  return concat(png.subarray(0, 8), pngChunk("IHDR", header), png.subarray(ihdrEnd));
}

/** `png` as an APNG declaring `frames` frames. */
function animatedPng(frames: number): Uint8Array {
  const control = concat(u32be(frames), u32be(0));
  return concat(png.subarray(0, ihdrEnd), pngChunk("acTL", control), png.subarray(ihdrEnd));
}

/**
 * The renderer's test images (made for the repository, no third-party image): a 24x16 PNG, a 32x16 JPEG, a GIF of
 * two 16x16 frames and a WebP; `turnedJpeg` is the JPEG with EXIF orientation 6 (shown 16x32).
 */
export const testImages = {
  png: { name: "pattern.png", bytes: png },
  jpeg: { name: "gradient.jpg", bytes: jpeg },
  gif: { name: "two-frames.gif", bytes: dataUriBytes(twoFramesGif) },
  webp: { name: "tall.webp", bytes: dataUriBytes(tallWebp) },
  turnedJpeg: { name: "turned.jpg", bytes: jpegWithExif(jpeg, orientationTiff(6, true)) },
  resizedPng,
  animatedPng,
};
