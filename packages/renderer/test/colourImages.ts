import type { Design } from "@readmint/format";
import type { ImageMime } from "../src/sniffImage.js";
import gifP3Iccrgbg1 from "./assets/colour/gif-p3-iccrgbg1.gif?inline";
import jpegAdobeIcc from "./assets/colour/jpeg-adobe-icc.jpg?inline";
import jpegP3Icc from "./assets/colour/jpeg-p3-icc.jpg?inline";
import jpegSrgbIcc from "./assets/colour/jpeg-srgb-icc.jpg?inline";
import pngCicpP3 from "./assets/colour/png-cicp-p3.png?inline";
import pngGama100000 from "./assets/colour/png-gama-100000.png?inline";
import pngGama45455 from "./assets/colour/png-gama-45455.png?inline";
import pngGamaChrmP3 from "./assets/colour/png-gama-chrm-p3.png?inline";
import pngP3Iccp from "./assets/colour/png-p3-iccp.png?inline";
import pngSrgbChunk from "./assets/colour/png-srgb-chunk.png?inline";
import webpP3Iccp from "./assets/colour/webp-p3-iccp.webp?inline";
import webpSrgbIccp from "./assets/colour/webp-srgb-iccp.webp?inline";

/** The stored colours of every colour fixture: four 8x16 swatches side by side, left to right, 32x16 in all. */
export const colourSwatches: readonly (readonly [number, number, number])[] = [
  [200, 60, 40],
  [40, 160, 90],
  [60, 80, 200],
  [128, 128, 128],
];

export interface ColourImage {
  readonly name: string;
  readonly mime: ImageMime;
  readonly uri: string;
  /**
   * Whether Chromium 156.0.8078.4 colour-manages the original bytes off their stored values (probe RM-58, max channel
   * difference 40 to 73); resvg-wasm 2.6.2 draws the stored values of every row.
   */
  readonly chromiumApplies: boolean;
  /** The most one channel may differ from `colourSwatches`: the JPEG rows are lossy (q95, 4:4:4). */
  readonly tolerance: number;
}

/**
 * Genuine colour-tagged images: the four swatches written by Pillow 12.0.0 (Python 3.11, Windows) through its own
 * encoders: JPEG `save(format="JPEG", quality=95, subsampling=0, icc_profile=…)`;
 * PNG iCCP `save(format="PNG", icc_profile=…)`; PNG sRGB, gAMA, cHRM and cICP chunks through `PngInfo.add(type,
 * data)` (sRGB intent 0; gAMA 45455 or 100000; cHRM D65 white with Display P3 primaries; cICP 12 13 0 1, Display P3
 * with the sRGB transfer); WebP `save(format="WEBP", lossless=True, icc_profile=…)` (VP8X, flag 0x20, ICCP chunk).
 * Pillow writes no GIF ICC, so the GIF is Pillow's 4-colour GIF with an `ICCRGBG1` `012` application extension holding
 * the Display P3 profile inserted after its global colour table (crafted, labelled so).
 *
 * Profiles: DisplayP3-v4.icc, AdobeCompat-v4.icc and sRGB-v4.icc of github.com/saucecontrol/Compact-ICC-Profiles at
 * commit bdd84663061bc4ae95ca70decff54f581e27f702, licence CC0-1.0.
 */
export const colourImages: readonly ColourImage[] = [
  {
    name: "JPEG with an sRGB ICC profile",
    mime: "image/jpeg",
    uri: jpegSrgbIcc,
    chromiumApplies: false,
    tolerance: 1,
  },
  {
    name: "JPEG with a Display P3 ICC profile",
    mime: "image/jpeg",
    uri: jpegP3Icc,
    chromiumApplies: true,
    tolerance: 1,
  },
  {
    name: "JPEG with an Adobe RGB ICC profile",
    mime: "image/jpeg",
    uri: jpegAdobeIcc,
    chromiumApplies: true,
    tolerance: 1,
  },
  {
    name: "PNG with a Display P3 iCCP",
    mime: "image/png",
    uri: pngP3Iccp,
    chromiumApplies: true,
    tolerance: 0,
  },
  {
    name: "PNG with an sRGB chunk",
    mime: "image/png",
    uri: pngSrgbChunk,
    chromiumApplies: false,
    tolerance: 0,
  },
  {
    name: "PNG with gAMA 45455 alone",
    mime: "image/png",
    uri: pngGama45455,
    chromiumApplies: false,
    tolerance: 0,
  },
  {
    name: "PNG with gAMA 100000 alone",
    mime: "image/png",
    uri: pngGama100000,
    chromiumApplies: true,
    tolerance: 0,
  },
  {
    name: "PNG with gAMA and Display P3 cHRM",
    mime: "image/png",
    uri: pngGamaChrmP3,
    chromiumApplies: true,
    tolerance: 0,
  },
  {
    name: "PNG with a Display P3 cICP",
    mime: "image/png",
    uri: pngCicpP3,
    chromiumApplies: true,
    tolerance: 0,
  },
  {
    name: "WebP with a Display P3 ICCP",
    mime: "image/webp",
    uri: webpP3Iccp,
    chromiumApplies: true,
    tolerance: 0,
  },
  {
    name: "WebP with an sRGB ICCP",
    mime: "image/webp",
    uri: webpSrgbIccp,
    chromiumApplies: false,
    tolerance: 0,
  },
  {
    name: "GIF with a Display P3 ICCRGBG1 extension",
    mime: "image/gif",
    uri: gifP3Iccrgbg1,
    chromiumApplies: false,
    tolerance: 0,
  },
];

/** A 32x16 design drawing the image `src` over the whole canvas, one stored pixel per drawn pixel. */
export function colourDesign(src: string): Design {
  return {
    version: 0,
    canvas: { width: 32, height: 16 },
    assets: { images: { picture: { src } } },
    layers: [{ type: "image", asset: "picture", width: 32, height: 16, fit: "fill" }],
  };
}

/** The largest channel difference of any pixel of the 32x16 RGBA `pixels` from the swatch it lies in. */
export function swatchDeviation(pixels: ArrayLike<number>): number {
  let largest = 0;
  for (let index = 0; index < 32 * 16; index++) {
    const swatch = colourSwatches[Math.floor((index % 32) / 8)] ?? [0, 0, 0];
    for (let channel = 0; channel < 3; channel++) {
      const drawn = pixels[index * 4 + channel] ?? 0;
      largest = Math.max(largest, Math.abs(drawn - (swatch[channel] ?? 0)));
    }
  }
  return largest;
}

const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0));

/** A JPEG APP2 segment of `signature` (`ICC_PROFILE\0`, `MPF\0`, ...) and `payload`, marker included. */
export function app2(signature: string, payload: readonly number[]): number[] {
  const length = 2 + signature.length + payload.length;
  return [0xff, 0xe2, length >> 8, length & 255, ...ascii(signature), ...payload];
}

/** Part `sequence` of `count` of an ICC profile in a JPEG: the APP2 segment decoders join. */
export const iccSegment = (sequence: number, count: number, profile: readonly number[]) =>
  app2("ICC_PROFILE\0", [sequence, count, ...profile]);

/** `data` with `part` inserted at byte `at`. */
export function inserted(data: Uint8Array, at: number, part: readonly number[]): Uint8Array {
  const out = new Uint8Array(data.length + part.length);
  out.set(data.subarray(0, at));
  out.set(part, at);
  out.set(data.subarray(at), at + part.length);
  return out;
}

/** Where each `FF <marker>` of a JPEG starts; entropy-coded data stuffs every FF, so these are real markers. */
export function jpegMarkerOffsets(jpeg: Uint8Array, marker: number): number[] {
  const offsets: number[] = [];
  for (let index = 0; index + 1 < jpeg.length; index++) {
    if (jpeg[index] === 0xff && jpeg[index + 1] === marker) offsets.push(index);
  }
  return offsets;
}

/**
 * `jpeg` (baseline, SOF0) with a fill byte, an ICC segment and two stray bytes right after its frame header: past it
 * the walk skips stray bytes, so a copy without the segment must not join them to the fill byte (it would read 0x01 as
 * a marker).
 */
export function iccBetweenFillAndStray(jpeg: Uint8Array): Uint8Array {
  const sof = jpegMarkerOffsets(jpeg, 0xc0)[0] ?? 0;
  const frameEnd = sof + 2 + (((jpeg[sof + 2] ?? 0) << 8) | (jpeg[sof + 3] ?? 0));
  return inserted(jpeg, frameEnd, [0xff, ...iccSegment(1, 1, [1, 2, 3, 4]), 0x01, 0x02]);
}
