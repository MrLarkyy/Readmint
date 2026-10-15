import type { RasterFormat } from "./RasterFormat.js";
import type { RasterLimits } from "./RasterLimits.js";

export interface RasterOptions {
  readonly format: RasterFormat;
  /** Raster pixels per SVG pixel, 1..4; default 2 (sharp on high-density screens). */
  readonly scale?: number;
  /** Frames per second sampled from the timeline, 1..60 (GIF 1..50); default 30, GIF 25. */
  readonly frameRate?: number;
  /** Milliseconds on the timeline: export that one frame as a still image. */
  readonly time?: number;
  readonly limits?: Partial<RasterLimits>;
}
