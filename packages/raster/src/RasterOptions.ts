import type { RasterFormat } from "./RasterFormat.js";
import type { RasterLimits } from "./RasterLimits.js";

export interface RasterOptions {
  readonly format: RasterFormat;
  /** Raster pixels per SVG pixel, 1..4; default 2 (sharp on high-density screens). */
  readonly scale?: number;
  /**
   * Frames per second sampled from the timeline, 1..60 (GIF 1..50). Default 30 (GIF 25), lowered to the highest whole
   * rate that fits `maxFrames`, `maxTotalPixels` and `maxImagePixels`, and again to a projected rate while the encoded
   * file passes `maxOutputBytes`, never below the lowest rate that samples two frames; a rate given here is never
   * changed.
   */
  readonly frameRate?: number;
  /** Milliseconds on the timeline: export that one frame as a still image. */
  readonly time?: number;
  /** WebP only: whole number 1..100, lossy at that libwebp quality; absent = lossless. */
  readonly quality?: number;
  readonly limits?: Partial<RasterLimits>;
}
