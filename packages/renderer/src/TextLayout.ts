import type { TextLine } from "./TextLine.js";

/** The placed lines of a text, shared by every copy of it in a render. */
export interface TextLayout {
  readonly lines: readonly TextLine[];
  /** The explicit width, or the widest line. */
  readonly width: number;
  readonly drawnAs: "font" | "paths";
  /** Some glyph is written as a private-use character: the text then carries its own text as its accessible name. */
  readonly privateUse: boolean;
  /** Some glyph is right-to-left: the drawer must keep the visual order written. */
  readonly rtl: boolean;
}
