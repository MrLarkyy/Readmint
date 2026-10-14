/** A range of the compiled text in 0-based UTF-16 code units; `end` is exclusive. */
export interface Span {
  readonly start: number;
  readonly end: number;
}
