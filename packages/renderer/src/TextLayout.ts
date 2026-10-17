import type { TextLine } from "./TextLine.js";

/** The placed lines of a text, shared by every copy of it in a render. */
export interface TextLayout {
  /**
   * The drawn text in NFC, its accessible name: canonically equivalent contents get the same bytes. It is the content,
   * or with lines left out by `maxLines` the content up to the last drawn line and that line's cut.
   */
  readonly text: string;
  readonly lines: readonly TextLine[];
  /** The explicit width, or the widest line. */
  readonly width: number;
  readonly drawnAs: "font" | "paths";
  /** Some glyph is written as a private-use character: the text then carries its own text as its accessible name. */
  readonly privateUse: boolean;
  /** Some glyph is right-to-left: the drawer must keep the visual order written. */
  readonly rtl: boolean;
}
