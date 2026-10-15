/**
 * JPEG symbol-check steps of one render (or one raster export), every image together: as many as one file may take
 * (`maxEntropySteps`), so many crafted copies cost no more than the worst single one. A fixed internal bound, like
 * the render's shaping work, not a `RenderLimits` field.
 */
export const maxRenderEntropySteps = 134_217_728;

/**
 * What is left of `maxRenderEntropySteps` for the images still to be checked. `sniffImage` charges it; once a JPEG
 * crossed it, `exhausted` is set and that sniff failed, which the caller reports as too much work, not a bad image.
 */
export class EntropyBudget {
  remaining = maxRenderEntropySteps;
  exhausted = false;

  /** The message of a check that crossed the budget. */
  static message(): string {
    return `checking the JPEG image data of every image together takes more than ${String(maxRenderEntropySteps)} decoding steps`;
  }
}
