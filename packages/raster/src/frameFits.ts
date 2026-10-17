import type { RasterLimits } from "./RasterLimits.js";

/**
 * Whether an export of `frames` frames of `width` x `height` pixels stays inside the frame, total pixel and image
 * work limits. Image work is linear in the frames: `imageBase` pixels once (the WebP swaps) plus `imagePerFrame` for
 * each frame.
 */
export function frameFits(
  limits: RasterLimits,
  width: number,
  height: number,
  imageBase: number,
  imagePerFrame: number,
): (frames: number) => boolean {
  return (frames) =>
    frames <= limits.maxFrames &&
    width * height * frames <= limits.maxTotalPixels &&
    imageBase + imagePerFrame * frames <= limits.maxImagePixels;
}
