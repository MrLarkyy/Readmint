/** Metrics and character mapping of a TrueType or OpenType (CFF) font. */
export interface SfntFont {
  readonly format: "ttf" | "otf";
  readonly unitsPerEm: number;
  /** Font units above the baseline (positive). */
  readonly ascender: number;
  /** Font units below the baseline (zero or negative). */
  readonly descender: number;
  readonly lineGap: number;
  /** OS/2 fsType: the licence embedding flags. */
  readonly fsType: number;
  /** OS/2 usWeightClass. */
  readonly weightClass: number;
  /** Typographic family (name 16), else the family (name 1); empty when the font names none. */
  readonly familyName: string;
  readonly numGlyphs: number;
  /** Glyph of a Unicode code point; 0 (.notdef) when the font has none. */
  glyphFor(codePoint: number): number;
  /** Advance width of a glyph in font units. */
  advanceOf(glyph: number): number;
}

/** `unsupported`: a known container this version does not read; `malformed`: broken or not a font. */
export type SfntProblemKind = "unsupported" | "malformed";

export type SfntResult =
  | { readonly ok: true; readonly font: SfntFont }
  | { readonly ok: false; readonly kind: SfntProblemKind; readonly message: string };
