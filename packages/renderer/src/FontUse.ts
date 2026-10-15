import type { LoadedFont } from "./loadFont.js";

/** What a render draws with one font asset; collected while texts are laid out and drawn. */
export interface FontUse {
  readonly font: LoadedFont;
  /** Code point -> glyph of every character drawn with the embedded subset: what the subset maps. */
  readonly embedded: Map<number, number>;
  /** Distinct glyphs drawn, either way. */
  readonly glyphs: Set<number>;
  /** Glyph -> the private-use code point it is written as (shaped glyphs no character of the font draws). */
  readonly privateCodes: Map<number, number>;
  /** Length of the data URI of the embedded subset. */
  embeddedBytes: number;
  /** Path data written for text drawn as paths. */
  pathBytes: number;
}
