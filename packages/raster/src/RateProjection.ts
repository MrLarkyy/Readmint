import { frameCount } from "./frameCount.js";
import type { DelayUnit } from "./frameDelays.js";
import type { Timeline } from "./Timeline.js";

/** The share of the byte limit a projected frame rate aims at: frames differ more at a lower rate. */
const margin = 0.7;

/**
 * The frame rate that should keep an animation under the byte limit, projected from an encoder that went over it. The
 * first frame (a whole picture, plus the headers) costs the same at any rate; every later frame written is taken to
 * cost the average of those written so far, and a lower rate to sample all its frames with none merged, so a merge
 * is never counted as a saving.
 */
export class RateProjection {
  private head: number | undefined;
  private frames = 0;

  constructor(
    private readonly animation: Timeline,
    private readonly unit: DelayUnit,
    private readonly frameRate: number,
    private readonly maxBytes: number,
  ) {}

  /** A frame is in the encoder: `bytes` written so far. */
  written(bytes: number): void {
    this.head ??= bytes;
    this.frames++;
  }

  /**
   * The highest whole rate below the current one that fits, 1 when only that does, undefined when none does. `bytes`
   * is the size the encoder reached; `failedOnFrame` says the frame that took it over was not counted by `written`.
   */
  rate(bytes: number, failedOnFrame: boolean): number | undefined {
    const { head } = this;
    const frames = this.frames + (failedOnFrame ? 1 : 0);
    if (head === undefined || frames < 2 || !(bytes > head)) return undefined;
    const perFrame = (bytes - head) / (frames - 1);
    const size = (rate: number): number =>
      head + perFrame * (frameCount(this.animation, rate, this.unit) - 1);
    for (let rate = this.frameRate - 1; rate >= 1; rate--) {
      if (size(rate) <= this.maxBytes * margin) return rate;
    }
    return this.frameRate > 1 && size(1) <= this.maxBytes ? 1 : undefined;
  }
}
