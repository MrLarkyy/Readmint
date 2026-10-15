/** Bounds of one raster export; a caller may lower them (or raise them for tests) through `RasterOptions.limits`. */
export interface RasterLimits {
  /** Pixels per side of the raster image, after scaling. */
  readonly maxSide: number;
  /** Frames sampled from the timeline, before identical frames merge. */
  readonly maxFrames: number;
  /** Milliseconds of the timeline. */
  readonly maxDuration: number;
  /** Pixels of every frame together: what bounds the rasterizing work and memory. */
  readonly maxTotalPixels: number;
  /** Bytes of the encoded file. */
  readonly maxOutputBytes: number;
  /** Image pixels decoded over the whole export: each image once per draw per frame, plus each WebP swap. */
  readonly maxImagePixels: number;
}

export const RasterLimits: RasterLimits = Object.freeze({
  /** The largest canvas side the design format allows (docs/design-format.md). */
  maxSide: 4096,
  maxFrames: 1000,
  /** The longest timeline the design format allows. */
  maxDuration: 60_000,
  /** 256 Mpx: one 4096 x 4096 frame sixteen times over, or 1000 frames of 512 x 512. */
  maxTotalPixels: 268_435_456,
  /** The default content length limit of GitHub's camo image proxy, as for the SVG. */
  maxOutputBytes: 5_242_880,
  /** 256 Mpx, some 4 s of decoding: one 4096 x 4096 image drawn sixteen times, or a 512 x 512 one 1000 times. */
  maxImagePixels: 268_435_456,
});
