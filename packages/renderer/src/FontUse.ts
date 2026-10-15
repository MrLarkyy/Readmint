import type { LoadedFont } from "./loadFont.js";

/** What a render draws with one font asset; collected while texts are laid out and drawn. */
export interface FontUse {
  readonly font: LoadedFont;
  /** Code point -> glyph of every character drawn with the embedded subset: what the subset maps. */
  readonly embedded: Map<number, number>;
  /** Distinct glyphs drawn, either way. */
  readonly glyphs: Set<number>;
  /** Length of the data URI of the embedded subset. */
  embeddedBytes: number;
  /** Path data written for text drawn as paths. */
  pathBytes: number;
}
