import type { RasterFormat } from "./RasterFormat.js";

/** An encoded raster image. */
export interface RasterOutput {
  readonly bytes: Uint8Array;
  /** The format written: `png` for an `apng` request of a still design. */
  readonly format: RasterFormat;
  readonly mimeType: string;
  /** Raster pixels. */
  readonly width: number;
  readonly height: number;
  /** The design's size in CSS pixels, for the `<img>` width and height. */
  readonly displayWidth: number;
  readonly displayHeight: number;
  /** Frames in the file, after identical frames merged; 1 for a still image. */
  readonly frames: number;
  /** Milliseconds of one play of the timeline; 0 for a still image. */
  readonly duration: number;
}
