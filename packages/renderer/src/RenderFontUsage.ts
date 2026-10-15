/** What one font asset adds to a successful render. */
export interface RenderFontUsage {
  readonly asset: string;
  /**
   * Bytes the font adds to the SVG: the data URI of its embedded subset, plus the path data of text drawn with it
   * as paths.
   */
  readonly bytes: number;
  /** Distinct glyphs drawn with it, either way (.notdef and composite components not counted). */
  readonly glyphs: number;
  /** `font` when a subset is embedded, `paths` when every glyph of it is drawn as path data. */
  readonly drawnAs: "font" | "paths";
}
