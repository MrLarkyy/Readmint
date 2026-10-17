import { RasterError } from "./RasterError.js";

/** The share of the byte limit a projected frame rate aims at: some bytes do not shrink with the rate. */
const margin = 0.7;

/**
 * Names the frame rate that should fit in a "raster-output-too-large" error of an animation. The bytes of the first
 * frame (a whole picture, plus the headers) stay at any rate; the bytes after it are taken to grow with the time
 * covered, and so with the frame rate.
 */
export class RateProjection {
  private head: { bytes: number; end: number } | undefined;

  constructor(
    private readonly duration: number,
    private readonly frameRate: number,
    private readonly maxBytes: number,
  ) {}

  /** The first frame is in the encoder: `bytes` written so far, the timeline up to `end` ms covered. */
  written(bytes: number, end: number): void {
    this.head ??= { bytes, end };
  }

  /** `error` itself, or an output-size error that names the rate, for `bytes` written when `covered` ms were done. */
  explain(error: unknown, bytes: number, covered: number): unknown {
    if (!(error instanceof RasterError) || error.code !== "raster-output-too-large") return error;
    const { head } = this;
    if (head === undefined || !(covered > head.end) || !(bytes > head.bytes)) return error;
    const whole =
      head.bytes + ((bytes - head.bytes) * (this.duration - head.end)) / (covered - head.end);
    const room = this.maxBytes * margin - head.bytes;
    const rate = Math.floor((this.frameRate * room) / (whole - head.bytes));
    if (!(rate >= 1 && rate < this.frameRate)) return error;
    return new RasterError(
      error.code,
      `${error.message} (about ${String(rate)} fps fits at this size)`,
    );
  }
}
