import type { FontFormat } from "./FontFormat.js";
import type { GlyphOutline } from "./GlyphOutline.js";
import type { OutlineBudget } from "./OutlineBudget.js";

/**
 * Metrics, character mapping, kerning and outlines of a TrueType or OpenType (CFF) font; `shapeText` reads its
 * layout tables (`table`).
 */
export interface SfntFont {
  /** The sfnt flavour: TrueType or OpenType with CFF outlines. */
  readonly format: "ttf" | "otf";
  /** The container the bytes came in: the flavour itself, or WOFF / WOFF2 around it. */
  readonly container: FontFormat;
  readonly outlines: "glyf" | "cff";
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
  /** Bytes of the sfnt the font is read from: the file itself, or what its WOFF / WOFF2 decoded to. */
  readonly sfntBytes: number;
  /** Glyph of a Unicode code point; 0 (.notdef) when the font has none. */
  glyphFor(codePoint: number): number;
  /** Advance width of a glyph in font units. */
  advanceOf(glyph: number): number;
  /** Left side bearing of a glyph in font units (hmtx). */
  bearingOf(glyph: number): number;
  /**
   * Pair kerning between two glyphs in font units, 0 for none: the GPOS kern lookups applied to the pair by the
   * shaping engine (`shapeText`), else the legacy kern table. Read on first use: throws `MalformedFont`.
   */
  kerning(left: number, right: number): number;
  /**
   * Outline of a glyph in font units. Read on request: throws `MalformedFont` for a broken glyph, and `FontRefused`
   * (`too-large`) when it would pass `budget`.
   */
  outline(glyph: number, budget?: OutlineBudget): GlyphOutline;
  /** The bytes of a table (shared with the font), undefined when the font has none. */
  table(tag: string): Uint8Array | undefined;
}

/** `unsupported`: a known format this version does not read; `too-large`: past `maxBytes`; `malformed`: broken. */
export type SfntProblemKind = "unsupported" | "too-large" | "malformed";

export type SfntResult =
  | { readonly ok: true; readonly font: SfntFont }
  | { readonly ok: false; readonly kind: SfntProblemKind; readonly message: string };
