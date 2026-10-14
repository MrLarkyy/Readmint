/** Bounds of one render; a caller may lower them (or raise them for tests) through `RenderOptions.limits`. */
export interface RenderLimits {
  /** Output SVG in UTF-8 bytes. */
  readonly maxOutputBytes: number;
  /** One image asset, decoded, checked before decoding. */
  readonly maxImageBytes: number;
  /** One font asset, decoded, checked before decoding. */
  readonly maxFontBytes: number;
  /** Pixels per image side. */
  readonly maxImageSide: number;
  /** Frames of an animated GIF, APNG or WebP. */
  readonly maxAnimationFrames: number;
  /** UTF-16 code units of a text after its placeholders are filled in. */
  readonly maxTextLength: number;
  /** Expression steps of the whole render (`@readmint/expr` budget, shared by every evaluation). */
  readonly maxExpressionSteps: number;
}

export const RenderLimits: RenderLimits = Object.freeze({
  /** The default content length limit of GitHub's camo image proxy. */
  maxOutputBytes: 5_242_880,
  maxImageBytes: 4_194_304,
  maxFontBytes: 4_194_304,
  /** Keeps the raster path (RM-15) within memory. */
  maxImageSide: 8192,
  maxAnimationFrames: 1000,
  maxTextLength: 10_000,
  /** Under a second of the most expensive string work (upper/lower over long text); copies dropped by `if` write nothing, so output cannot bound it. */
  maxExpressionSteps: 5_000_000,
});
