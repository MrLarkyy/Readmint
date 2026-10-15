/** A font raster export draws with. */
export interface RasterFont {
  /** TrueType or OpenType bytes, a WOFF already decoded. */
  readonly bytes: Uint8Array;
  /** The family inside the font (name 16, else 1): what resvg matches `font-family` against. */
  readonly family: string;
  /** The `@font-face` rule that embeds it; absent for a font the caller gave. */
  readonly face?: { readonly family: string; readonly weight: number; readonly style: string };
}
