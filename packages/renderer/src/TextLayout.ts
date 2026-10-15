import type { TextLine } from "./TextLine.js";

/** The placed lines of a text, shared by every copy of it in a render. */
export interface TextLayout {
  readonly lines: readonly TextLine[];
  /** The explicit width, or the widest line. */
  readonly width: number;
  readonly drawnAs: "font" | "paths";
}
