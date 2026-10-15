import type { ScriptCode } from "./unicode/scriptOf.js";

/** How `shapeText` shapes one run: a single script, a single direction, one font. */
export interface ShapeOptions {
  /** The run's script (`scriptOf`); default: the first character's that is not Common or Inherited. */
  readonly script?: ScriptCode;
  /** A right-to-left run: mirrored characters take their mirror glyph, glyphs come out in visual order. */
  readonly rtl?: boolean;
  /** Feature kern (pair kerning), default on. Marks still attach without it. */
  readonly kerning?: boolean;
  /** Features liga, clig and calt (optional ligatures and contextual alternates), default on. */
  readonly ligatures?: boolean;
}
