import type { RasterLimits } from "./RasterLimits.js";

/**
 * What the frame, total pixel and image work limits allow of an export of `width` x `height` pixel frames. Image work
 * is linear in the frames: `imageBase` pixels once (the WebP swaps) plus `imagePerFrame` for each frame.
 */
export class FrameBudget {
  constructor(
    private readonly limits: RasterLimits,
    private readonly width: number,
    private readonly height: number,
    private readonly imageBase: number,
    private readonly imagePerFrame: number,
  ) {}

  /** Image pixels decoded over `frames` frames. */
  imagePixels(frames: number): number {
    return this.imageBase + this.imagePerFrame * frames;
  }

  fits(frames: number): boolean {
    return (
      frames <= this.limits.maxFrames &&
      this.width * this.height * frames <= this.limits.maxTotalPixels &&
      this.imagePixels(frames) <= this.limits.maxImagePixels
    );
  }
}
