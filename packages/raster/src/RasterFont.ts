/** A font raster export draws with. */
export interface RasterFont {
  /** TrueType or OpenType bytes, a WOFF already decoded. */
  readonly bytes: Uint8Array;
  /** The family inside the font (name 16, else 1): what resvg matches `font-family` against. */
  readonly family: string;
  /**
   * Weight (OS/2 usWeightClass), `font-stretch` keyword (usWidthClass) and style (fsSelection) as resvg reads them
   * from the font, which it matches `font-weight`, `font-stretch` and `font-style` against.
   */
  readonly drawn: { readonly weight: number; readonly stretch: string; readonly style: string };
  /** The `@font-face` rule that embeds it; absent for a font the caller gave. */
  readonly face?: { readonly family: string; readonly weight: number; readonly style: string };
}
