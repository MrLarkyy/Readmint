/** Bounds of what the editor accepts from the user before it decodes or renders anything. */
export const EditorLimits = Object.freeze({
  /** Fixture data file in UTF-8 bytes: the CLI's `maxFixtureBytes`, so a fixture the editor takes renders there too. */
  maxFixtureBytes: 8 * 1024 * 1024,
  /** One font file: the renderer's `RenderLimits.maxFontBytes`, checked before the file is parsed. */
  maxFontBytes: 4_194_304,
  /** One image file attached for a path-sourced asset: the renderer's `RenderLimits.maxImageBytes`. */
  maxImageBytes: 4_194_304,
  /** A preview render running longer is stopped (its worker terminated) and reported. */
  renderTimeoutMs: 10_000,
});

export type EditorLimits = typeof EditorLimits;
