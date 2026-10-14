/** Stable machine-readable reason of an expression error; part of the public contract. */
export type ExpressionErrorCode =
  | "syntax"
  | "too-long"
  | "too-deep"
  | "unknown-name"
  | "unknown-filter"
  | "argument"
  | "type"
  | "not-finite"
  | "too-large"
  | "budget"
  | "unknown-locale"
  | "invalid-date"
  | "invalid-data";

export interface ExpressionError {
  readonly code: ExpressionErrorCode;
  /** Ends with "at column <start + 1>"; never contains a value read from the data. */
  readonly message: string;
  /** 0-based offsets in UTF-16 code units into the compiled text; `end` is exclusive. */
  readonly start: number;
  readonly end: number;
  /** The `{{ }}` placeholder around `start`, clipped to `maxEcho` characters, invisible characters escaped. */
  readonly excerpt: string;
}
