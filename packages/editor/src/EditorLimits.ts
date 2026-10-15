/** Bounds of what the editor accepts from the user before it decodes or renders anything. */
export const EditorLimits = Object.freeze({
  /** Fixture data file in UTF-8 bytes: the CLI's `maxFixtureBytes`, so a fixture the editor takes renders there too. */
  maxFixtureBytes: 8 * 1024 * 1024,
  /** One font file: the renderer's `RenderLimits.maxFontBytes`, checked before the file is parsed. */
  maxFontBytes: 4_194_304,
  /**
   * Every font the editor reads to check its licence, together, decoded (WOFF and WOFF2 by their declared size,
   * before anything inflates); identical sources count once. The renderer's `maxTotalFontBytes`.
   */
  maxTotalFontBytes: 16_777_216,
  /**
   * One image file, uploaded or attached for a path-sourced asset: the renderer's `RenderLimits.maxImageBytes`,
   * checked before the file is read.
   */
  maxImageBytes: 4_194_304,
  /** Design edits undo can step back through; the oldest is dropped beyond it. */
  maxHistory: 100,
  /** A preview render running longer is stopped (its worker terminated) and reported. */
  renderTimeoutMs: 10_000,
  /** A raster export running longer is stopped (its worker terminated) and reported. */
  rasterTimeoutMs: 120_000,
});

export type EditorLimits = typeof EditorLimits;
